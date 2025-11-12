// ! Arquivo: server.js (Completo e Final - CORS Corrigido)
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
// ! CONFIGURAÇÃO CORS (SOLUÇÃO)
// Permite que qualquer origem ('*') acesse a API.
// -------------------------------------------------------------------
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    // Essencial para o JWT
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
// -------------------------------------------------------------------


// Rota de Teste Pública (Status do Servidor)
app.get('/', (req, res) => {
  res.status(200).send('Servidor Marketplace está rodando!');
});

// Inicialização do servidor
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
