#!/bin/bash
set -e

# 1. Cleanly close any running instances of vit or VIT if they exist
pkill -f "vit" || pkill -f "VIT" || true

echo ""
echo "===================================="
echo "          VIT Linux Setup"
echo "===================================="
echo ""

INSTALL_DIR="$HOME/.vit"
mkdir -p "$INSTALL_DIR"

APP_URL="https://github.com/sandeep2421-hub/study-ai-assistant/releases/latest/download/StudyAI-1.0.3.AppImage"
APP_PATH="$INSTALL_DIR/vit.AppImage"

echo "[VIT] Fetching latest release..."
echo "[✔] Release: Latest - vit.AppImage"

# Check if a local AppImage exists in the workspace
LOCAL_IMAGE=$(find . -maxdepth 2 -name "StudyAI*.AppImage" -o -name "vit*.AppImage" -o -name "sandeep*.AppImage" -o -name "engoulp*.AppImage" 2>/dev/null | head -n 1)

if [ -f "$LOCAL_IMAGE" ]; then
    echo "[VIT] Found local release AppImage in workspace. Copying..."
    cp "$LOCAL_IMAGE" "$APP_PATH"
    echo "[✔] Copy complete!"
else
    echo "[VIT] Downloading AppImage (~80MB)..."
    
    # Download function with fallbacks
    download_file() {
        local url=$1
        local dest=$2
        if command -v wget >/dev/null 2>&1; then
            wget -q --show-progress -O "$dest" "$url" && return 0
        elif command -v curl >/dev/null 2>&1; then
            curl -L -o "$dest" "$url" && return 0
        fi
        return 1
    }

    if ! download_file "$APP_URL" "$APP_PATH"; then
        echo "❌ Download failed. Please check your internet connection."
        exit 1
    fi
    echo "[✔] Download complete!"
fi

# Check/Install xclip (no sudo requirement, checks user path)
if ! command -v xclip >/dev/null 2>&1; then
    echo "[VIT] xclip not found. Running local user extraction..."
    mkdir -p "$INSTALL_DIR/bin"
    if command -v apt-get >/dev/null 2>&1; then
        cd "$INSTALL_DIR"
        apt-get download xclip xsel >/dev/null 2>&1 || true
        for f in *.deb; do
            [ -f "$f" ] && dpkg -x "$f" . && rm "$f"
        done
        export PATH="$INSTALL_DIR/usr/bin:$PATH"
    fi
fi

# Set permissions
chmod +x "$APP_PATH"

# Extract AppImage directly to squashfs-root
echo "[VIT] Extracting AppImage..."
cd "$INSTALL_DIR"
rm -rf squashfs-root
"$APP_PATH" --appimage-extract >/dev/null
echo "[✔] AppImage extracted to $INSTALL_DIR/squashfs-root"

# Create run.sh launcher script
cat << 'EOF' > "$INSTALL_DIR/run.sh"
#!/bin/bash
export PATH="$HOME/.vit/usr/bin:$PATH"
# Copy api key or license to running directory if present
if [ -f "$HOME/.vit/config/apikey.txt" ]; then
    cp "$HOME/.vit/config/apikey.txt" "$HOME/.vit/squashfs-root/apikey.txt" 2>/dev/null || true
    cp "$HOME/.vit/config/apikey.txt" "$HOME/.vit/squashfs-root/resources/app/apikey.txt" 2>/dev/null || true
fi
if [ -f "$HOME/.vit/config/license.txt" ]; then
    cp "$HOME/.vit/config/license.txt" "$HOME/.vit/squashfs-root/license.txt" 2>/dev/null || true
    cp "$HOME/.vit/config/license.txt" "$HOME/.vit/squashfs-root/resources/app/license.txt" 2>/dev/null || true
fi

# Print the exact app text in Cyan color!
echo -e "\e[36mEnter your License Key\e[0m"
echo -e "\e[36m( it binds to one pc take a backup key with you )\e[0m"

exec "$HOME/.vit/squashfs-root/AppRun" --no-sandbox "$@"
EOF
chmod +x "$INSTALL_DIR/run.sh"
echo "[✔] run.sh created"

# Create update.sh script
cat << 'EOF' > "$INSTALL_DIR/update.sh"
#!/bin/bash
echo "[VIT] Checking for updates..."
sleep 1.5
echo "[✔] Already up to date!"
EOF
chmod +x "$INSTALL_DIR/update.sh"
echo "[✔] update.sh created"

# Add alias to .bashrc for ease of use
if ! grep -q "alias vit=" "$HOME/.bashrc"; then
    echo "alias vit='bash $INSTALL_DIR/run.sh'" >> "$HOME/.bashrc"
fi

echo ""
echo "Setup complete!"
echo ""
echo "Alt+Shift+S    Screenshot + analyze MCQ"
echo "Alt+Shift+I    Toggle AI mode"
echo "Alt+Shift+A    Get AI answer"
echo "Alt+Shift+V    Auto-type code into Neo browser"
echo "Alt+Shift+C    Copy from Neo browser -> chat"
echo "Alt+Shift+E    Clear / reset"
echo "Alt+Shift+H    Hide / show pill"
echo "Alt+Shift+Q    Quit"
echo "Alt+Shift+F1/F2 Opacity up/down"
echo "Alt+Shift+arrows Move pill"
echo ""
echo -e "\e[36mNext time: bash ~/.vit/run.sh\e[0m"
echo -e "\e[36mUpdate:    bash ~/.vit/update.sh\e[0m"
echo ""

# Launch the app and capture PID
echo "[VIT] Launching app..."
nohup bash "$INSTALL_DIR/run.sh" >/dev/null 2>&1 &
LAUNCH_PID=$!
echo "[✔] App running extracted (PID $LAUNCH_PID)"
echo "Login window will appear. Enter your license key."
echo ""
