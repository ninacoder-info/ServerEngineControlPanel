# DNS test plan: `seu.ninacoder.top`

## Server details

- Public dedicated-server IP: `51.161.115.162`
- Private PowerDNS VPS IP: `192.168.122.233`
- DNS nameservers:
  - `dns1.seu.ninacoder.top`
  - `dns2.seu.ninacoder.top`
- Forward TCP and UDP port `53` from the dedicated server to `192.168.122.233:53`.
- Both nameservers currently use the same public IP. This is acceptable for testing, but production DNS should use two independent servers or networks.

## Before changing the domain

1. Install and start PowerDNS on the VPS.
2. Create the authoritative zone:

   ```text
   seu.ninacoder.top
   ```

3. Configure PowerDNS to listen on `192.168.122.233:53` or `0.0.0.0:53`.
4. Create the zone’s SOA and NS records using:

   ```text
   dns1.seu.ninacoder.top.
   dns2.seu.ninacoder.top.
   ```

## Registrar / parent DNS records

At the DNS provider currently managing `ninacoder.top`, create the delegation for the `seu` subdomain:

```text
seu.ninacoder.top       NS  dns1.seu.ninacoder.top.
seu.ninacoder.top       NS  dns2.seu.ninacoder.top.
```

Create glue/host records for the in-zone nameservers:

```text
dns1.seu.ninacoder.top  A   51.161.115.162
dns2.seu.ninacoder.top  A   51.161.115.162
```

The registrar may call these “child nameservers”, “host records”, or “glue records”.

## Website records inside PowerDNS

Example records in the `seu.ninacoder.top` zone:

```text
seu.ninacoder.top       A  51.161.115.162
www.seu.ninacoder.top   A  51.161.115.162
```

If the dedicated Nginx proxy sends the website to the VPS, use the dedicated server’s public IP for the website `A` record.

## Tests

Test PowerDNS directly before changing delegation:

```bash
dig @51.161.115.162 seu.ninacoder.top SOA
dig @51.161.115.162 seu.ninacoder.top NS
```

After delegation and propagation:

```bash
dig seu.ninacoder.top SOA
dig NS seu.ninacoder.top
dig seu.ninacoder.top A
```

Remember: DNS forwarding requires both UDP 53 and TCP 53. Do not change the domain nameservers until PowerDNS is installed, the zone exists, and the direct `dig @51.161.115.162` tests respond.
