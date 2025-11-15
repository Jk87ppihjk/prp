const express = require('express');
const cors = require('cors');
require('dotenv').config(); // Carrega as variáveis de ambiente (DB_HOST, JWT_SECRET, etc)

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares Essenciais
app.use(cors());
app.use(express.json());

// --- Importação das Rotas Modulares ---
const loginRoutes = require('./login');
const adminRoutes = require('./adminRoutes');
const productRoutes = require('./productRoutes');
const storeRoutes = require('./storeRoutes');
const fyRoutes = require('./fyRoutes');
const uploadRoutes = require('./uploadRoutes');
// NOVO: Importação das rotas de usuário (onde está a rota PUT /api/user/address)
const userRoutes = require('./userRoutes'); 

// NOVO: As três partes das rotas de entrega
const orderCreationRoutes = require('./orderCreationRoutes');
const logisticsAndConfirmationRoutes = require('./logisticsAndConfirmationRoutes');
const trackingAndDataRoutes = require('./trackingAndDataRoutes');

// --- Uso das Rotas ---
// O prefixo /api é adicionado aqui
app.use('/api', loginRoutes);
app.use('/api', adminRoutes);
app.use('/api', productRoutes);
app.use('/api', storeRoutes);
app.use('/api', fyRoutes);
app.use('/api', uploadRoutes);
// NOVO: Registro das rotas de usuário
app.use('/api', userRoutes);

// NOVO: Registro das rotas modulares de delivery sob o prefixo /delivery
app.use('/api/delivery', orderCreationRoutes);
app.use('/api/delivery', logisticsAndConfirmationRoutes);
app.use('/api/delivery', trackingAndDataRoutes);

// Rota "raiz" para verificar se o servidor está online
app.get('/', (req, res) => {
    res.send('API do Marketplace está operacional.');
});

// Iniciar o Servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    
    // Log de verificação das variáveis de ambiente
    console.log(`DB_HOST: ${process.env.DB_HOST ? 'Configurado' : 'NÃO CONFIGURADO!'}`);
    console.log(`JWT_SECRET: ${process.env.JWT_SECRET ? 'Configurado' : 'NÃO CONFIGURADO!'}`);
    console.log(`CLOUDINARY_CLOUD_NAME: ${process.env.CLOUDINARY_CLOUD_NAME ? 'Configurado' : 'NÃO CONFIGURADO!'}`);
    console.log(`BREVO_API_KEY: ${process.env.BREVO_API_KEY ? 'Configurado' : 'NÃO CONFIGURADO!'}`);
});
