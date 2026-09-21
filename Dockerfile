FROM node:22.23.0-bookworm-slim
WORKDIR /app
RUN mkdir /data && chown node:node /data
COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node shared ./shared
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=6011 LORE_DATA_DIR=/data
EXPOSE 6011
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:6011/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server/main.mjs"]
