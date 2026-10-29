FROM node:22-slim
ENV NODE_ENV=production PORT=80 DATA_DIR=/data
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY public ./public
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME /data
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","server/index.js"]
