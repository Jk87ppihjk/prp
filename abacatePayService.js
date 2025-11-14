// ! Arquivo: abacatePayService.js
const axios = require('axios');

// ! Configuração da API AbacatePay
const ABACATEPAY_API_URL = 'https://api.abacatepay.com/v1/payments'; // URL de produção (exemplo)
const ABACATEPAY_SECRET = process.env.ABACATEPAY_SECRET;

/**
 * Processa um pagamento através da API da AbacatePay.
 * * @param {number} amount - O valor total a ser cobrado.
 * @param {string} token - Token de pagamento (ex: cartão de crédito tokenizado, PIX ID).
 * @param {string} description - Descrição do pagamento.
 * @returns {Promise<object>} - Objeto contendo o sucesso e o ID da transação.
 */
const createPayment = async (amount, token, description) => {
    if (!ABACATEPAY_SECRET) {
        throw new Error('Serviço de pagamento indisponível: ABACATEPAY_SECRET ausente.');
    }

    try {
        const response = await axios.post(
            ABACATEPAY_API_URL, 
            {
                amount: amount,
                currency: 'BRL', // Moeda
                source_token: token, 
                description: description,
            },
            {
                headers: {
                    // Autenticação usando a chave secreta (Bearer Token é um padrão comum)
                    'Authorization': `Bearer ${ABACATEPAY_SECRET}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // Assumindo que a AbacatePay retorna um status 'succeeded' em `response.data`
        if (response.data.status === 'succeeded') {
            return { 
                success: true, 
                transaction_id: response.data.id
            };
        } else {
            throw new Error(response.data.message || 'Falha na transação de pagamento.');
        }

    } catch (error) {
        // Lida com erros de rede ou de resposta da API
        const errorDetail = error.response ? error.response.data.message : error.message;
        console.error('❌ ERRO FATAL ao comunicar com AbacatePay:', errorDetail);
        throw new Error(`Falha no pagamento: ${errorDetail}`);
    }
};

module.exports = {
    createPayment
};
