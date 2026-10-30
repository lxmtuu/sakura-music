#!/usr/bin/env bash
# Copy completed local backups to an rclone crypt remote. Never deletes remote files.
set -euo pipefail
if [[ $# != 2 ]]; then
  echo 'Usage: offsite-backup.sh <data-directory> <rclone-crypt-remote-name>' >&2
  exit 2
fi
data_dir=$1
remote=$2
if [[ ! $remote =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo 'Invalid rclone remote name.' >&2
  exit 2
fi
backup_dir="$data_dir/auto-backups"
if [[ ! -d $backup_dir ]] || [[ -z $(find "$backup_dir" -maxdepth 1 -type f -name 'auto-*.json' -print -quit) ]]; then
  echo 'No completed automatic backups found.' >&2
  exit 1
fi
# Do not print rclone configuration: it may contain sensitive credentials.
if ! rclone config show "$remote" | grep -Eq '^type[[:space:]]*=[[:space:]]*crypt[[:space:]]*$'; then
  echo 'The configured remote must be an rclone crypt remote.' >&2
  exit 1
fi
# Serialize jobs on the host. Keep this file: deleting it while a job runs
# would permit a second job to acquire a different inode.
exec 9>"$data_dir/.offsite-backup.lock"
if ! flock -n 9; then
  echo 'An offsite backup job is already running.' >&2
  exit 1
fi
# Ignore temporary files; local retention must exceed the outage/retry window.
# copy never removes files from Dropbox. Remote retention is managed separately.
rclone copy "$backup_dir" "$remote:" --include 'auto-*.json' --exclude '*' --immutable
