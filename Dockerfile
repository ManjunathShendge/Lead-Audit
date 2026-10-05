# The Playwright image ships Chromium plus its OS dependencies for both amd64 and arm64, which is what
# Oracle Cloud's Always Free Ampere instances need. The tag must match the playwright version in
# package.json; a mismatch makes Playwright download a browser it cannot run.
FROM mcr.microsoft.com/playwright:v1.63.0-jammy

# Browsers are preinstalled here by the base image. Do not point this at ./.browsers in a container.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

# Install dependencies first so that a source-only change does not reinstall the tree.
COPY package.json package-lock.json ./
COPY prisma ./prisma
# postinstall runs prisma generate, which needs the schema copied above.
RUN npm ci

COPY . .

# next build reads .env if present; supply a placeholder so a missing DATABASE_URL cannot fail the build.
# Nothing is read from the database at build time because every app route is dynamic.
ARG DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ARG DIRECT_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV DATABASE_URL=$DATABASE_URL
ENV DIRECT_URL=$DIRECT_URL
RUN npm run build

# The image runs either the web server or the worker; docker compose picks which.
EXPOSE 3000
CMD ["npm", "run", "start"]
