#!/bin/sh
# Contact sheet of baked colour tiles: tools/tex/preview.sh out.png name...
out=$1; shift
args=""; n=0
for name in "$@"; do args="$args -i public/tex/${name}_512_c.webp"; n=$((n+1)); done
ffmpeg -hide_banner -loglevel error -y $args -filter_complex "$(i=0; f=""; while [ $i -lt $n ]; do f="$f[$i:v]format=rgb24,scale=384:384[v$i];"; i=$((i+1)); done; i=0; while [ $i -lt $n ]; do f="$f[v$i]"; i=$((i+1)); done; echo "${f}hstack=inputs=$n")" -frames:v 1 $out
