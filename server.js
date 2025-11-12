// ! Arquivo: server.js (Completo e Final)
const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

// Importa Rotas e Middlewares
const accessRoutes = require('./login'); 
const productRoutes = require('./productRoutes'); 
const adminRoutes = require('./adminRoutes'); // <-- Rota com /cities e /admin
const storeRoutes = require('./storeRoutes'); 
const { protect } = require('./authMiddleware'); 

// -------------------------------------------------------------------
// CONFIGURAÇÃO INICIAL
// -------------------------------------------------------------------

// CORS: Permite qualquer domínio acessar a API
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// -------------------------------------------------------------------
// INTEGRAÇÃO DE ROTAS
// -------------------------------------------------------------------

// Rotas de Acesso (Login, Cadastro)
app.use('/api', accessRoutes); 

// Rotas de Produtos (Lojistas/Públicas)
app.use('/api', productRoutes); 

// Rotas de Gestão de Loja (Seller)
app.use('/api', storeRoutes); 

// ! Rotas de Admin (INCLUI /cities e /admin/...)
app.use('/api', adminRoutes); 


// -------------------------------------------------------------------
// Rota de Teste Pública (Status do Servidor)
// -------------------------------------------------------------------
app.get('/', (req, res) => {
  // Se o servidor estiver ok, ele responde isso
  res.status(200).send('Servidor Marketplace está rodando!');
});

// -------------------------------------------------------------------
// Rota de Erro 404 Padrão (IMPORTANTE para debugging)
// Se nenhuma rota acima funcionar, Express devolve o 404 (Cannot GET)
// -------------------------------------------------------------------
app.use((req, res, next) => {
    res.status(404).send("404: Endpoint não encontrado. Verifique a URL.");
});

// Inicialização do servidor
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
