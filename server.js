// ! Arquivo: server.js (Completo e Final)
const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

// Importa Rotas e Middlewares
const accessRoutes = require('./login'); 
const productRoutes = require('./productRoutes'); 
const adminRoutes = require('./adminRoutes'); 
const storeRoutes = require('./storeRoutes'); // <-- NOVO: Rotas de Loja
const { protect } = require('./authMiddleware'); // Middleware de autenticação geral

// ! Configuração do CORS
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// --- Rotas de Acesso (Públicas) ---
app.use('/api', accessRoutes); 

// --- Rotas de Produtos (Lojistas) ---
app.use('/api', productRoutes); 

// --- Rotas de Admin (Cidades e Bairros) ---
app.use('/api', adminRoutes); 

// --- Rotas de Loja (Cadastro da Loja) ---
app.use('/api', storeRoutes); // <-- NOVO: Rotas de Loja

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
// -------------------------------------------------------------------


// Rota de Teste Pública (Status do Servidor)
app.get('/', (req, res) => {
  res.status(200).send('Servidor Marketplace está rodando!');
});

// Inicialização do servidor
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
