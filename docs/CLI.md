# Server Engine CLI

The native Server Engine installation provides the `se` command for SSH administration.

```bash
se <command> [options]
```

The command is installed at:

```text
/usr/local/bin/se
```

It is available after running the native installer or updating an existing installation.

## Requirements

- Run service start, stop, and restart commands as `root` or with `sudo`.
- The CLI is intended for a native Linux installation.
- PHP-FPM commands must identify the PHP version because every version has its own process, socket, and configuration.

## Panel commands

Control the Server Engine control panel services:

```bash
se panel start
se panel stop
se panel restart
se panel status
se panel logs
se panel logs --lines 200
```

The panel commands operate on these systemd units:

```text
server-engine-core.service
server-engine-web.service
```

## Service commands

Supported managed services:

- `mysql`
- `nginx`
- `php` / PHP-FPM

### MySQL

```bash
se mysql start
se mysql stop
se mysql restart
se mysql status
se mysql logs
se mysql logs --lines 200
```

### Nginx

```bash
se nginx start
se nginx stop
se nginx restart
se nginx status
se nginx logs
```

### PHP-FPM

Use `status` without a version to see every installed PHP-FPM runtime:

```bash
se php status
```

Specify a version for actions and logs:

```bash
se php start --version 8.3
se php stop --version 8.3
se php restart --version 8.3
se php status --version 8.3
se php logs --version 8.3
se php logs --version 8.3 --lines 200
```

PHP-FPM status is based on the version-specific PID file and socket. A runtime is only reported as running when its process and socket are available.

## Generic service form

The same service commands are also available with the explicit form:

```bash
se service mysql restart
se service nginx status
se service php restart --version 8.3
se service php logs --version 8.3
```

## Help

```bash
se --help
se panel --help
se service --help
se php --help
```

## Exit status

- `0`: command completed successfully.
- `1`: command failed, the service is unavailable, or a requested log does not exist.
- `2`: invalid command, unsupported service, or missing PHP version.

When a service action fails, the CLI prints the same runtime error used by the control panel. Add `--verbose` to service log/action commands when supported to print the captured service log:

```bash
se mysql restart --verbose
se php restart --version 8.3 --verbose
```

## Development environment

`se` is the production/native command. The repository’s existing development wrapper remains separate:

```bash
./bin/serverengine start dev
./bin/serverengine restart dev
./bin/serverengine logs dev
./bin/serverengine status dev
```

The Docker development container does not provide systemd, so `se panel restart` is intended for the installed native server rather than the Docker development stack.
