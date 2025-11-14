// ! Arquivo: abacatePayService.js (Integração PIX AbacatePay)
const axios = require('axios'); // Requerido para requisições HTTP

const ABACATEPAY_API_URL = 'https://api.abacatepay.com/v1/pixQrCode/create';
const ABACATEPAY_SECRET = process.env.ABACATEPAY_SECRET;

/**
 * Cria um QRCode PIX através da API da AbacatePay.
 * @param {number} amount - O valor total a ser cobrado em centavos.
 * @param {number} expiresIn - Tempo de expiração em segundos (Ex: 3600 para 1 hora).
 * @param {string} description - Descrição do pagamento.
 * @param {object} customer - Dados do cliente (opcional).
 * @returns {Promise<object>} - Objeto contendo o sucesso e os dados do QRCode PIX.
 */
const createPixQrCode = async (amount, expiresIn, description, customer = null) => {
    if (!ABACATEPAY_SECRET) {
        throw new Error('Serviço de pagamento indisponível: ABACATEPAY_SECRET ausente.');
    }

    // Validação dos dados do cliente, se fornecidos
    if (customer && (!customer.name || !customer.cellphone || !customer.email || !customer.taxId)) {
        throw new Error('Dados do cliente incompletos. Se o cliente for fornecido, todos os campos (name, cellphone, email, taxId) são obrigatórios.');
    }

    try {
        const requestBody = {
            amount: amount,
            expiresIn: expiresIn,
            description: description
        };

        // Adiciona os dados do cliente ao corpo da requisição, se fornecidos
        if (customer) {
            requestBody.customer = customer;
        }

        const response = await axios.post(
            ABACATEPAY_API_URL,
            requestBody,
            {
                headers: {
                    'Authorization': `Bearer ${ABACATEPAY_SECRET}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // Verifica se a requisição foi bem-sucedida (status 200 e dados presentes)
        if (response.status === 200 && response.data.data) {
            return {
                success: true,
                qrCodeData: response.data.data // Retorna os dados do QRCode PIX (inclui txid, qrCodeImage, qrCodeString)
            };
        } else {
            throw new Error(response.data.error || 'Falha ao criar QRCode PIX.');
        }

    } catch (error) {
        // Lida com erros de rede ou de resposta da API
        const errorDetail = error.response ? error.response.data.error : error.message;
        console.error('❌ ERRO FATAL ao comunicar com AbacatePay:', errorDetail);
        throw new Error(`Falha ao criar QRCode PIX: ${errorDetail}`);
    }
};

module.exports = {
    createPixQrCode
};
