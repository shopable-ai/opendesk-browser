#!/bin/sh
# Developer-only generator for independently decodable H.264 MP4/HLS VOD; not a product dependency.
set -eu
cd "$(dirname "$0")"
ffmpeg -hide_banner -loglevel error -f lavfi -i 'testsrc=size=32x32:rate=5' -t 1 \
  -c:v libx264 -pix_fmt yuv420p -preset ultrafast -crf 45 -an -movflags +faststart \
  -y tiny.mp4
ffmpeg -hide_banner -loglevel error -i tiny.mp4 -c copy -f hls -hls_time 1 \
  -hls_list_size 0 -hls_playlist_type vod -hls_segment_filename 'tiny-seg%02d.ts' \
  -y generated-media.m3u8
ffprobe -hide_banner -loglevel error -show_entries format=format_name,duration -of json tiny.mp4
echo 'Generated tiny.mp4, tiny-seg00.ts and generated-media.m3u8; verify actual segment list.'
