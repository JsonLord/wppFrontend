# Stage 1: Build the Vite application
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy the rest of the source code
COPY . .

# Build the application, creating the 'dist' folder
RUN npm run build

# Stage 2: Production image
FROM node:20-alpine

# Install Chromium and dependencies for Puppeteer
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont

# Tell Puppeteer to use the installed Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Set the environment to production
ENV NODE_ENV production

# Copy only the necessary files for running the app
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.js ./server.js

# Expose the port required by Hugging Face
EXPOSE 7860

# The command to start our custom Node.js server
CMD ["node", "server.js"]
