// ! Arquivo: server.js (Completo e Final)
const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

// Importa Rotas e Middlewares
const accessRoutes = require('./login'); 
const productRoutes = require('./productRoutes'); 
const adminRoutes = require('./adminRoutes'); 
const storeRoutes = require('./storeRoutes'); 
const { protect } = require('./authMiddleware'); 

// -------------------------------------------------------------------
// NOVAS ROTAS FY/UPLOAD
// -------------------------------------------------------------------
const uploadRoutes = require('./uploadRoutes'); // Rota para Multer/Uploads
const fyRoutes = require('./fyRoutes');       // Rota para Vídeos Fy e interações sociais

// -------------------------------------------------------------------
// CONFIGURAÇÃO INICIAL E CORS
// -------------------------------------------------------------------

// CORS: Permite qualquer origem ('*') para evitar o erro de conexão (CORS)
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Express para processar JSON
app.use(express.json());

// -------------------------------------------------------------------
// INTEGRAÇÃO DE ROTAS (A ORDEM DEVE SER MANTIDA)
// -------------------------------------------------------------------

// --- 1. Rotas de Uploads (Processamento de Arquivos) ---
app.use('/api', uploadRoutes); 

// --- 2. Rotas Fy/Social (Vídeos, Likes, Comentários) ---
app.use('/api', fyRoutes);    

// --- 3. Rotas de Acesso (Login, Cadastro) ---
app.use('/api', accessRoutes); 

// --- 4. Rotas de Produtos ---
app.use('/api', productRoutes); 

// --- 5. Rotas de Admin (Cidades, Bairros) ---
app.use('/api', adminRoutes); 

// --- 6. Rotas de Loja (Perfil, Listagem) ---
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

// Rota de Erro 404 Padrão (IMPORTANTE para debugging)
app.use((req, res, next) => {
    // Retorna JSON para o frontend em vez de HTML, prevenindo SyntaxError
    res.status(404).json({ success: false, message: "404: Endpoint não encontrado. Verifique a URL." });
});


// Inicialização do servidor
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
