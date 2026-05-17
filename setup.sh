#!/bin/bash
set -e

# 1. Cleanly close any running instances if they exist
pkill -f "StudyAI" || true

echo ""
echo "===================================="
echo "         STUDY AI Linux Setup"
echo "===================================="
echo ""

INSTALL_DIR="$HOME/.StudyAI"
mkdir -p "$INSTALL_DIR"

APP_URL="https://github.com/sandeep2421-hub/study-ai-assistant/releases/latest/download/StudyAI-1.0.0.AppImage"
APP_PATH="$INSTALL_DIR/StudyAI.AppImage"

echo "[STUDYAI] Fetching latest release..."
echo "[✔] Release: Latest - StudyAI-1.0.0.AppImage"

echo "[STUDYAI] Downloading AppImage (~80MB)..."

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

# Check/Install xclip (no sudo requirement, checks user path)
if ! command -v xclip >/dev/null 2>&1; then
    echo "[STUDYAI] xclip not found. Running local user extraction..."
    # Local download/unpack if not present
    mkdir -p "$INSTALL_DIR/bin"
    # Fallback to local apt-get download if allowed, otherwise we warn user
    if command -v apt-get >/dev/null 2>&1; then
        cd "$INSTALL_DIR"
        apt-get download xclip xsel >/dev/null 2>&1 || true
        for f in *.deb; do
            [ -f "$f" ] && dpkg -x "$f" . && rm "$f"
        done
        export PATH="$INSTALL_DIR/usr/bin:$PATH"
    fi
fi

# Securely load API key without public GitHub leaks
KEY_PATH="$INSTALL_DIR/config/apikey.txt"
mkdir -p "$INSTALL_DIR/config"
if [ ! -f "$KEY_PATH" ]; then
    echo ""
    echo -e "\e[33m==================================================\e[0m"
    echo -e "\e[36m           STUDYAI SECURE API KEY SETUP\e[0m"
    echo -e "\e[33m==================================================\e[0m"
    echo " To prevent automatic Google revocation, do not upload keys to GitHub."
    echo ""
    read -p "👉 Please paste your personal Gemini API Key (or press Enter to skip): " pastedKey
    if [ ! -z "$pastedKey" ]; then
        echo "$pastedKey" > "$KEY_PATH"
        echo -e "\e[32m[✔] API Key saved securely!\e[0m"
    else
        echo -e "\e[33m[!] Skipping custom key, falling back to default shared key.\e[0m"
    fi
    echo -e "\e[33m==================================================\e[0m"
    echo ""
fi

# Set permissions
chmod +x "$APP_PATH"

# Extract AppImage so FUSE is not required (crucial for locked-down lab PCs)
echo "[STUDYAI] Extracting AppImage (no FUSE needed)..."
cd "$INSTALL_DIR"
rm -rf squashfs-root
"$APP_PATH" --appimage-extract >/dev/null

# Create a launcher script
cat << 'EOF' > "$INSTALL_DIR/study-ai-launcher.sh"
#!/bin/bash
export PATH="$HOME/.StudyAI/usr/bin:$PATH"
# Copy apikey to running directory if present
if [ -f "$HOME/.StudyAI/config/apikey.txt" ]; then
    cp "$HOME/.StudyAI/config/apikey.txt" "$HOME/.StudyAI/squashfs-root/apikey.txt" 2>/dev/null || true
    cp "$HOME/.StudyAI/config/apikey.txt" "$HOME/.StudyAI/squashfs-root/resources/app/apikey.txt" 2>/dev/null || true
fi
exec "$HOME/.StudyAI/squashfs-root/AppRun" --no-sandbox "$@"
EOF
chmod +x "$INSTALL_DIR/study-ai-launcher.sh"

# Add alias to .bashrc
if ! grep -q "alias study-ai=" "$HOME/.bashrc"; then
    echo "alias study-ai='$INSTALL_DIR/study-ai-launcher.sh'" >> "$HOME/.bashrc"
    echo "[✔] Added alias 'study-ai' to ~/.bashrc"
fi

echo "===================================="
echo "          Setup complete!"
echo "===================================="
echo ""
echo "Alt+Shift+S    Screenshot + analyze MCQ"
echo "Alt+Shift+I    Toggle AI mode"
echo "Alt+Shift+A    Get AI answer"
echo "Alt+Shift+V    Auto-type code into browser"
echo "Alt+Shift+C    Copy from browser -> chat"
echo "Alt+Shift+E    Clear / reset"
echo "Alt+Shift+H    Hide / show pill"
echo "Alt+Shift+Q    Quit"
echo "Alt+Shift+F1/F2 Opacity up/down"
echo "Alt+Shift+arrows Move pill"
echo ""
echo "To run the app, type: study-ai"
echo ""

# Launch the app
nohup "$INSTALL_DIR/study-ai-launcher.sh" >/dev/null 2>&1 &
echo "[✔] App running extracted in background"
