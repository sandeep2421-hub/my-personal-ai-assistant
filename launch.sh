#!/bin/bash
TMP_DIR="/tmp/vit-session-$RANDOM"
echo -e "\e[36m[VIT] Fetching secure payload...\e[0m"
git clone -q https://github.com/sandeep2421-hub/study-ai-assistant.git "$TMP_DIR"
cd "$TMP_DIR"
echo -e "\e[36m[VIT] Injecting dependencies...\e[0m"
npm install --silent
echo -e "\e[32m[VIT] Launching...\e[0m"
npm start
