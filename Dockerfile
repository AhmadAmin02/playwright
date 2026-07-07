FROM mcr.microsoft.com/playwright:v1.61.1-jammy

WORKDIR /app

# xvfb (wajib buat puppeteer-real-browser di Linux) + Google Chrome stable
RUN apt-get update \
&& apt-get install -y --no-install-recommends xvfb wget gnupg ca-certificates \
&& wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
&& echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
&& apt-get update \
&& apt-get install -y --no-install-recommends google-chrome-stable \
&& rm -rf /var/lib/apt/lists/*

ENV CHROME_PATH=/usr/bin/google-chrome-stable

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "src/server.js"]