// ! Arquivo: server.js (CORS Permitindo QUALQUER DOMÍNIO)
const express = require('express');
const cors = require('cors'); // Middleware para CORS
const app = express();
const port = process.env.PORT || 3000;

// Importa Rotas e Middlewares
const accessRoutes = require('./login'); 
const productRoutes = require('./productRoutes'); 
const adminRoutes = require('./adminRoutes'); 
const storeRoutes = require('./storeRoutes'); 
const { protect } = require('./authMiddleware'); 

// -------------------------------------------------------------------
// ! CONFIGURAÇÃO CORS (SOLUÇÃO DE PROBLEMAS)
// Permite que qualquer origem ('*') acesse a API e inclui o cabeçalho Authorization
// -------------------------------------------------------------------
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// --- INTEGRAÇÃO DE ROTAS ---
app.use('/api', accessRoutes); 
app.use('/api', productRoutes); 
app.use('/api', adminRoutes); // Inclui as rotas /admin/cities e /cities
app.use('/api', storeRoutes); 

// -------------------------------------------------------------------
// Rota de Teste de Autenticação GERAL
// -------------------------------------------------------------------
app.get('/api/user/profile', protect, (req, res) => {
    res.status(200).json({ 
        success: true, 
        message: 'Acesso ao Perfil Autorizado. JWT Válido!',
        data: {
            id: req.user.id,
            email: req.user.email,
            city: req.user.city
        }
    });
});

// Rota de Teste Pública (Status do Servidor)
app.get('/', (req, res) => {
  res.status(200).send('Servidor Marketplace está rodando!');
});

// -------------------------------------------------------------------
// Rota de Erro 404 Padrão (IMPORTANTE para debugging)
// -------------------------------------------------------------------
app.use((req, res, next) => {
    // Retorna JSON para o frontend em vez de HTML, prevenindo SyntaxError
    res.status(404).json({ success: false, message: "404: Endpoint não encontrado. Verifique a URL." });
});


// Inicialização do servidor
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
