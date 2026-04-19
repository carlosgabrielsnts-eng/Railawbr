Argos RJ - pacote Railway com login Discord

O que foi ajustado:
- botão de login em login.html agora é link real para /auth/discord/login
- callback oficial do backend em /auth/discord/callback
- callback legado /auth/discord/callback.html redireciona para a rota correta
- frontend e backend no mesmo projeto, prontos para subir no Railway
- healthcheck em /api/health

Como subir no Railway:
1. Crie um novo projeto no Railway
2. Envie esta pasta ou conecte um repositório
3. Adicione as variáveis de ambiente com base no .env.example
4. Depois do deploy, copie a URL pública do Railway
5. No Discord Developer Portal > OAuth2 > Redirects, use exatamente:
   https://SEU-APP.up.railway.app/auth/discord/callback
6. Atualize APP_BASE_URL e DISCORD_REDIRECT_URI para a mesma URL
7. Faça um redeploy

Observações importantes:
- Gere um NOVO DISCORD_CLIENT_SECRET antes de usar
- Não use login.html como callback
- O botão de login já aponta para a rota backend correta
