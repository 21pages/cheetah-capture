#!/bin/bash

echo "===== start build ====="

NOW_PATH=$(cd $(dirname $0); pwd)

WEB_CAPTURE_PATH=$(cd $NOW_PATH/../; pwd)

cd $WEB_CAPTURE_PATH

# 检测是否有缓存 编译好的lib 如果没有拉ffmpeg库进行编译
# wget http://ffmpeg.org/releases/ffmpeg-3.4.8.tar.xz
# tar -xvf ./ffmpeg-3.4.8.tar.xz -C ./script

git clone https://github.com/emscripten-core/emsdk.git

cd emsdk
  git pull
  # Download and install the latest SDK tools.
  ./emsdk install latest
  # Make the "latest" SDK "active" for the current user. (writes .emscripten file)
  ./emsdk activate latest
   # Activate PATH and other environment variables in the current terminal
   source ./emsdk_env.sh
cd ../
# bash ./script/build_ffmpeg-emcc.sh

bash ./script/build_wasm.sh

npm run gents
# 贴tmp目录 构造结构
mkdir -p output/tmp
mkdir -p output/types
cp -r tmp/*  output/tmp
cp -r types/*  output/types
cp -r package.json  output/
cp -r README.md  output/
# 压缩tar
tar zcvf output.tar.gz ./output

# rm -rf ./dist/
# rm -rf ./tmp/
echo "=========="
ls
echo "=========="

echo "===== start build js ====="

# echo "wasm path is: $WASM_PATH"

# export WASM_PATH

# npm run webpack-worker

echo "===== finish build js ====="

# $WEB_CAPTURE_PATH/script/build_wasm.sh

# rm -rf ./tmp/

echo "===== finish build ====="