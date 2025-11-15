// ! Arquivo: logisticsAndConfirmationRoutes.js (Rotas 4, 5, 6 - CORRIGIDO O FLUXO DE CÓDIGO)

const express = require('express');
const router = express.Router();
const pool = require('./config/db');
const { protectDeliveryPerson } = require('./deliveryAuthMiddleware');
const { protect } = require('./authMiddleware'); 

// --- Constantes Comuns ---
const MARKETPLACE_FEE_RATE = 0.05; // 5%
const DELIVERY_FEE = 5.00;         // R$ 5,00


// ===================================================================
// ROTAS DO ENTREGADOR
// ===================================================================

/**
 * Rota 4: Entregador: Lista Pedidos Disponíveis
 * (GET /api/delivery/available)
 */
router.get('/available', protectDeliveryPerson, async (req, res) => {
    const entregadorId = req.user.id;
    if (req.user.is_available === 0) {
         return res.status(200).json({ success: true, message: 'Você está ocupado no momento.', orders: [] });
    }
    
    try {
        const [availableOrders] = await pool.execute(
            `SELECT 
                o.id, o.total_amount, o.delivery_code, o.delivery_pickup_code,
                s.name AS store_name, u.full_name AS buyer_name
             FROM orders o
             JOIN deliveries d ON o.id = d.order_id
             JOIN stores s ON o.store_id = s.id
             JOIN users u ON o.buyer_id = u.id
             WHERE o.status = 'Delivering' 
               AND d.delivery_person_id IS NULL 
               AND d.status = 'Requested'
               AND o.delivery_method = 'Marketplace'
             ORDER BY o.created_at ASC`
        );
        
        res.status(200).json({ success: true, orders: availableOrders });
    } catch (error) {
        console.error('[DELIVERY/AVAILABLE] Erro ao listar pedidos:', error);
        res.status(500).json({ success: false, message: 'Erro interno.' });
    }
});

/**
 * Rota 5: Entregador: Aceitar Pedido
 * (PUT /api/delivery/accept/:orderId)
 * Retorna o CÓDIGO DE RETIRADA (delivery_pickup_code) para o Entregador.
 */
router.put('/accept/:orderId', protectDeliveryPerson, async (req, res) => {
    const orderId = req.params.orderId;
    const entregadorId = req.user.id;

    if (req.user.is_available === 0) {
        return res.status(400).json({ success: false, message: 'Você já está com uma entrega pendente.' });
    }

    try {
        await pool.query('BEGIN');

        // 1. Atribui o entregador ao pedido (só se estiver 'Requested' e livre)
        const [deliveryUpdate] = await pool.execute(
            `UPDATE deliveries SET delivery_person_id = ?, status = 'Accepted' 
             WHERE order_id = ? AND status = 'Requested' AND delivery_person_id IS NULL`,
            [entregadorId, orderId]
        );
        
        if (deliveryUpdate.affectedRows === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Pedido não disponível ou já aceito.' });
        }

        // 2. Marca o entregador como OCUPADO
        await pool.execute('UPDATE users SET is_available = FALSE WHERE id = ?', [entregadorId]);
        
        // 3. BUSCA o código de retirada (para dar ao entregador)
        const [orderCode] = await pool.execute(
            `SELECT delivery_pickup_code FROM orders WHERE id = ?`, [orderId]
        );

        await pool.query('COMMIT');

        const pickupCode = orderCode[0]?.delivery_pickup_code;
        if (!pickupCode) {
             console.error(`[DELIVERY/ACCEPT] Erro crítico: Código de retirada não encontrado para Order ${orderId}`);
        }

        res.status(200).json({ 
            success: true, 
            message: 'Pedido aceito! Apresente o código de retirada na loja para o lojista confirmar a entrega.',
            delivery_pickup_code: pickupCode // CHAVE DE SEGURANÇA RETORNADA AO ENTREGADOR
        });

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('[DELIVERY/ACCEPT] Erro ao aceitar pedido:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao aceitar pedido.' });
    }
});


// ===================================================================
// ROTA DE CONFIRMAÇÃO E FLUXO FINANCEIRO
// ===================================================================

/**
 * Rota 6: Confirmação de Entrega (Comprador/Entregador)
 * (POST /api/delivery/confirm)
 * REGISTRA delivery_time e finaliza o ciclo financeiro.
 */
router.post('/confirm', protect, async (req, res) => {
    const userId = req.user.id; 
    const { order_id, confirmation_code } = req.body;

    try {
        await pool.query('BEGIN');
        
        // 1. Busca o pedido, verifica o código e o status 'Delivering'
        const [orderRows] = await pool.execute(
            `SELECT o.*, s.seller_id, s.contracted_delivery_person_id, d.delivery_person_id 
             FROM orders o
             JOIN stores s ON o.store_id = s.id
             LEFT JOIN deliveries d ON o.id = d.order_id
             WHERE o.id = ? AND o.delivery_code = ? AND o.status = 'Delivering'`,
            [order_id, confirmation_code]
        );

        const order = orderRows[0];
        if (!order) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Código ou pedido inválido.' });
        }

        const isDeliveryPerson = (order.delivery_person_id === userId);
        
        // Permissão: Comprador (buyerId) ou Entregador (delivery_person_id)
        if (order.buyer_id !== userId && !isDeliveryPerson) {
             await pool.query('ROLLBACK');
             return res.status(403).json({ success: false, message: 'Apenas o comprador ou entregador atribuído pode confirmar.' });
        }
        
        let paymentMessage = 'Pagamento em processamento.';
        
        // --- Processamento Financeiro e Registro de delivery_time ---
        
        if (order.delivery_method === 'Seller' || order.delivery_method === 'Contracted') {
            const marketplaceFee = order.total_amount * MARKETPLACE_FEE_RATE;
            const sellerEarnings = order.total_amount - marketplaceFee; 
            
            await pool.execute('UPDATE users SET pending_balance = pending_balance + ? WHERE id = ?', [sellerEarnings, order.seller_id]);
            paymentMessage = `Entrega confirmada. R$${sellerEarnings.toFixed(2)} creditados ao vendedor.`;
        }
        else if (order.delivery_method === 'Marketplace' && order.delivery_person_id) {
            const marketplaceFee = order.total_amount * MARKETPLACE_FEE_RATE;
            const deliveredPayment = DELIVERY_FEE; 
            const sellerEarnings = order.total_amount - marketplaceFee - deliveredPayment; 
            
            await pool.execute('UPDATE users SET pending_balance = pending_balance + ? WHERE id = ?', [deliveredPayment, order.delivery_person_id]);
            await pool.execute('UPDATE users SET pending_balance = pending_balance + ? WHERE id = ?', [sellerEarnings, order.seller_id]);
            await pool.execute('UPDATE users SET is_available = TRUE WHERE id = ?', [order.delivery_person_id]);
            
            paymentMessage = `Entrega Marketplace confirmada. R$${deliveredPayment.toFixed(2)} creditados ao entregador.`;
        }
        
        // Atualiza status da entrega e do pedido para finalizado, E REGISTRA O delivery_time
        await pool.execute('UPDATE orders SET status = "Completed" WHERE id = ?', [order_id]);
        await pool.execute(
            'UPDATE deliveries SET status = "Delivered_Confirmed", delivery_time = NOW(), buyer_confirmation_at = NOW() WHERE order_id = ?', 
            [order_id]
        );

        await pool.query('COMMIT');
        res.status(200).json({ success: true, message: `Entrega confirmada. ${paymentMessage}` });

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('[DELIVERY/CONFIRM] Erro ao confirmar entrega:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao confirmar entrega.' });
    }
});


module.exports = router;
