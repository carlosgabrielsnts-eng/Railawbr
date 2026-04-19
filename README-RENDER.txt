
BACKEND RENDER ADMIN - ARGOS RJ

Esse backend usa o mesmo Firebase do frontend.

O que ele faz:
- mostra painel admin em /admin
- confirma se o frontend está pingando
- lê usuários, pedidos e vínculos do Firebase
- gera QR Code e código PIX textual para pedidos novos
- permite aprovar/rejeitar pedidos pelo painel
- ao aprovar, entrega boxes e coins no perfil do usuário
- confirma vínculos pelo painel

Antes de subir:
1. Troque serviceAccount.json pelo arquivo real do Firebase Admin
2. Configure o .env conforme .env.example
3. Faça deploy no Render
4. Depois do deploy, copie a URL do backend e cole no frontend-netlify/config.js em backend.baseUrl

URLs:
- /admin
- /api/health
- /api/summary
- /api/orders
- /api/link-requests
