"""Optional offline GeoIP database management for Server Engine.

GeoIP is deliberately best-effort. Application Shield must remain usable when
the vendor download page or the network is unavailable.
"""

from __future__ import annotations

import gzip
import html
import json
import os
import re
import shutil
import tempfile
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock

import maxminddb


class GeoIpService:
    download_page = "https://db-ip.com/db/download/ip-to-country-lite"
    database_pattern = re.compile(
        r"(?:https?:)?//download\.db-ip\.com/free/"
        r"dbip-country-lite-\d{4}-\d{2}\.mmdb\.gz",
        re.IGNORECASE,
    )

    def __init__(self) -> None:
        service_root = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services"))
        self.root = Path(os.getenv("SE_GEOIP_ROOT", str(service_root / "geoip")))
        self.database_path = self.root / "dbip-country.mmdb"
        self.metadata_path = self.root / "metadata.json"
        self.country_root = self.root / "countries"
        self._reader_lock = RLock()
        self._reader = None
        self._reader_stamp = ""

    def _latest_url(self, page: str) -> str | None:
        matches = self.database_pattern.findall(html.unescape(page))
        if not matches:
            return None
        value = matches[0]
        return f"https:{value}" if value.startswith("//") else value

    def install_latest_country_database(self) -> dict[str, str | bool]:
        """Download and atomically install the latest DB-IP Lite country MMDB.

        Existing data is never removed until the new gzip archive has been
        fully downloaded and decompressed into the managed service directory.
        """
        self.root.mkdir(parents=True, exist_ok=True)
        page_request = urllib.request.Request(
            self.download_page,
            headers={"User-Agent": "ServerEngine/1.0 (+Application Shield GeoIP updater)"},
        )
        try:
            with urllib.request.urlopen(page_request, timeout=20) as response:
                page = response.read().decode("utf-8", errors="replace")
            url = self._latest_url(page)
            if not url:
                raise RuntimeError("DB-IP country database link was not found on the official download page")

            with tempfile.TemporaryDirectory(prefix="server-engine-geoip-", dir=self.root) as temporary:
                archive = Path(temporary) / "country.mmdb.gz"
                extracted = Path(temporary) / "country.mmdb"
                download_request = urllib.request.Request(
                    url,
                    headers={"User-Agent": "ServerEngine/1.0 (+Application Shield GeoIP updater)"},
                )
                with urllib.request.urlopen(download_request, timeout=120) as response, archive.open("wb") as target:
                    shutil.copyfileobj(response, target)

                with gzip.open(archive, "rb") as source, extracted.open("wb") as target:
                    shutil.copyfileobj(source, target)
                if extracted.stat().st_size < 1024:
                    raise RuntimeError("DB-IP country database is unexpectedly small")

                staged = self.database_path.with_suffix(".mmdb.new")
                shutil.copy2(extracted, staged)
                os.replace(staged, self.database_path)

            metadata = {
                "provider": "DB-IP Lite",
                "url": url,
                "installed_at": datetime.now(timezone.utc).isoformat(),
                "database": str(self.database_path),
                "license": "CC BY 4.0",
            }
            temporary_metadata = self.metadata_path.with_suffix(".json.new")
            temporary_metadata.write_text(json.dumps(metadata, indent=2) + "\n")
            os.replace(temporary_metadata, self.metadata_path)
            return {"installed": True, "url": url, "message": "DB-IP Lite country database installed."}
        except Exception as error:
            return {"installed": False, "message": str(error)}

    def status(self) -> dict:
        metadata = {}
        if self.metadata_path.exists():
            try:
                metadata = json.loads(self.metadata_path.read_text())
            except (OSError, json.JSONDecodeError):
                metadata = {}
        if not self.database_path.is_file():
            return {"installed": False, "ready": False, "path": str(self.database_path), "message": "Optional DB-IP country database is not installed."}
        try:
            with maxminddb.open_database(str(self.database_path)) as reader:
                database_metadata = reader.metadata()
                return {
                    "installed": True,
                    "ready": True,
                    "path": str(self.database_path),
                    "size": self.database_path.stat().st_size,
                    "database_type": database_metadata.database_type,
                    "build_epoch": database_metadata.build_epoch,
                    "provider": metadata.get("provider", "DB-IP Lite"),
                    "url": metadata.get("url", ""),
                    "license": metadata.get("license", "CC BY 4.0"),
                }
        except Exception as error:
            return {"installed": True, "ready": False, "path": str(self.database_path), "message": f"Country database cannot be read: {error}"}

    def lookup(self, address: str) -> dict | None:
        if not self.database_path.is_file():
            return None
        try:
            stamp = f"{self.database_path.stat().st_mtime_ns}:{self.database_path.stat().st_size}"
            with self._reader_lock:
                if self._reader is None or self._reader_stamp != stamp:
                    if self._reader is not None:
                        self._reader.close()
                    self._reader = maxminddb.open_database(str(self.database_path))
                    self._reader_stamp = stamp
                reader = self._reader
                value = reader.get(address) or {}
            country = value.get("country") or {}
            code = country.get("iso_code")
            if not code:
                return None
            continent = value.get("continent") or {}
            return {
                "country_code": code,
                "country_name": (country.get("names") or {}).get("en", code),
                "continent_code": continent.get("code", "??"),
                "continent_name": (continent.get("names") or {}).get("en", "Unknown"),
            }
        except (ValueError, OSError, maxminddb.errors.InvalidDatabaseError):
            return None

    def country_network_file(self, country_code: str) -> Path:
        """Create the provider CIDR file for a country from the MMDB tree."""
        country_code = country_code.upper()
        self.country_root.mkdir(parents=True, exist_ok=True)
        target = self.country_root / f"{country_code}.cidr"
        marker = target.with_suffix(".source")
        source_stamp = f"{self.database_path.stat().st_mtime_ns}:{self.database_path.stat().st_size}"
        if target.is_file() and marker.exists() and marker.read_text(errors="replace").strip() == source_stamp:
            return target
        temporary = target.with_suffix(".tmp")
        count = 0
        try:
            with maxminddb.open_database(str(self.database_path)) as reader, temporary.open("w") as output:
                for network, value in reader:
                    country = (value or {}).get("country") or {}
                    if country.get("iso_code") == country_code:
                        output.write(f"{network}\n")
                        count += 1
            if count == 0:
                temporary.unlink(missing_ok=True)
                raise ValueError(f"Country {country_code} is not present in the GeoIP database")
            os.replace(temporary, target)
            marker.write_text(source_stamp + "\n")
            return target
        finally:
            temporary.unlink(missing_ok=True)


geoip_service = GeoIpService()
