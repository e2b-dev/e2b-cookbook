#!/bin/bash
set -eu
# A PID namespace removes even detached children when its init process exits.
mount --make-rprivate /
mount --bind / /
mount -o remount,bind,ro /
mount -t tmpfs -o size=16m,mode=1777 tmpfs /tmp
mount -t tmpfs -o size=16m,mode=1777 tmpfs /dev/shm
cd /tmp
ulimit -u 16
ulimit -f 64
exec setpriv --reuid=65534 --regid=65534 --clear-groups --no-new-privs \
  python3 -I -B -c 'import os, runpy, sys; os.write(3, b"ready"); os.close(3); runpy.run_path(sys.argv[1], run_name="__main__")' "$1"
