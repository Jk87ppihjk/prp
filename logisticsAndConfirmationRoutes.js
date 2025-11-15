// ! Arquivo: logisticsAndConfirmationRoutes.js (CORRIGIDO: Segurança do delivery_code)

const express = require('express');
const router = express.Router();
const pool = require('./config/db');
const { protectSeller } = require('./sellerAuthMiddleware'); 
const { protectDeliveryPerson } = require('./deliveryAuthMiddleware');
const { protect } = require('./authMiddleware'); 

// --- Constantes Comuns ---
const MARKETPLACE_FEE_RATE = 0.05; // 5%
const DELIVERY_FEE = 5.00;         // R$ 5,00


// ===================================================================
// ROTAS DO ENTREGADOR
// ===================================================================

/**
 * Rota 4: Entregador: Lista Pedidos Disponíveis (GET /api/delivery/available)
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
 * Rota 5: Entregador: Aceitar Pedido (PUT /api/delivery/accept/:orderId)
 */
router.put('/accept/:orderId', protectDeliveryPerson, async (req, res) => {
    const orderId = req.params.orderId;
    const entregadorId = req.user.id;

    if (req.user.is_available === 0) {
        return res.status(400).json({ success: false, message: 'Você já está com uma entrega pendente.' });
    }

    try {
        await pool.query('BEGIN');

        // Aceita se estiver 'Requested' e sem entregador atribuído (Marketplace)
        const [deliveryUpdate] = await pool.execute(
            `UPDATE deliveries SET delivery_person_id = ?, status = 'Accepted' 
             WHERE order_id = ? AND status = 'Requested' AND delivery_person_id IS NULL`,
            [entregadorId, orderId]
        );
        
        if (deliveryUpdate.affectedRows === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Pedido não disponível ou já aceito.' });
        }
        
        // Busca o código de retirada gerado no pedido (o.delivery_pickup_code) para retornar ao entregador
        const [order] = await pool.execute('SELECT delivery_pickup_code FROM orders WHERE id = ?', [orderId]);
        const pickupCode = order[0]?.delivery_pickup_code;
        
        await pool.execute('UPDATE users SET is_available = FALSE WHERE id = ?', [entregadorId]);

        await pool.query('COMMIT');
        // Retorna o pickupCode para que o frontend do entregador possa exibí-lo
        res.status(200).json({ 
            success: true, 
            message: 'Pedido aceito! Apresente o código de retirada na loja.', 
            delivery_pickup_code: pickupCode 
        });

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('[DELIVERY/ACCEPT] Erro ao aceitar pedido:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao aceitar pedido.' });
    }
});

/**
 * Rota 11: Entregador: Ver Entrega Atual (GET /api/delivery/current)
 * CORREÇÃO: Removida a seleção do delivery_code (código final do cliente).
 */
router.get('/current', protectDeliveryPerson, async (req, res) => {
    const entregadorId = req.user.id;
    
    // Se o usuário estiver disponível (is_available = 1), não há entrega ativa.
    if (req.user.is_available) {
         return res.status(200).json({ success: true, delivery: null });
    }
    
    try {
        const [deliveryRows] = await pool.execute(
            `SELECT 
                o.id, o.total_amount, o.delivery_pickup_code, /* o.delivery_code REMOVIDO */
                u.full_name AS buyer_name, 
                s.name AS store_name, CONCAT(s.address_street, ', ', s.address_number) AS store_address, /* Endereço da Loja CORRIGIDO */
                d.delivery_time, d.pickup_time, d.packing_start_time, d.delivery_person_id,
                d.status AS delivery_status, /* Status da tabela deliveries */
                CONCAT(
                    o.delivery_address_street, ', ', o.delivery_address_number, 
                    ' (Ref: ', COALESCE(o.delivery_address_nearby, 'N/A'), ')'
                ) AS delivery_address /* Endereço de Entrega CORRIGIDO */
             FROM deliveries d
             JOIN orders o ON d.order_id = o.id
             JOIN stores s ON o.store_id = s.id
             JOIN users u ON o.buyer_id = u.id
             WHERE d.delivery_person_id = ? 
               AND o.status = 'Delivering' 
             LIMIT 1`,
            [entregadorId]
        );
        
        const delivery = deliveryRows[0] || null;

        if (delivery) {
             return res.status(200).json({ success: true, delivery: {
                 order: { 
                     id: delivery.id, 
                     total_amount: delivery.total_amount, 
                     store_name: delivery.store_name,
                     store_address: delivery.store_address, 
                     buyer_name: delivery.buyer_name,
                     delivery_address: delivery.delivery_address 
                 },
                 delivery_pickup_code: delivery.delivery_pickup_code, // CÓDIGO DE RETIRADA (Lojista)
                 // delivery_code: REMOVIDO DAQUI
                 status: delivery.delivery_status, 
             } });
        } else {
             // Sincronização: se ele deveria estar ocupado, mas não está em um pedido "Delivering",
             // provavelmente a entrega foi concluída. Marque como disponível.
             if (!req.user.is_available) {
                  await pool.execute('UPDATE users SET is_available = TRUE WHERE id = ?', [entregadorId]);
             }
             return res.status(200).json({ success: true, delivery: null, message: "Nenhuma entrega ativa encontrada. Status resetado." });
        }
    } catch (error) {
        console.error('[DELIVERY/CURRENT] Erro ao buscar entrega atual:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao buscar entrega atual.' });
    }
});


// ===================================================================
// ROTA DE CONFIRMAÇÃO E FLUXO FINANCEIRO
// ===================================================================

/**
 * Rota 6: Confirmação de Entrega (POST /api/delivery/confirm)
 * Confirma a entrega via código e atualiza o saldo (Lógica Financeira Completa e delivery_time).
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
            
            await pool.execute(
                'UPDATE users SET pending_balance = pending_balance + ? WHERE id = ?',
                [sellerEarnings, order.seller_id]
            );
            paymentMessage = `Entrega confirmada. R$${sellerEarnings.toFixed(2)} creditados ao vendedor.`;
        }
        else if (order.delivery_method === 'Marketplace' && order.delivery_person_id) {
            const marketplaceFee = order.total_amount * MARKETPLACE_FEE_RATE;
            const deliveredPayment = DELIVERY_FEE; 
            const sellerEarnings = order.total_amount - marketplaceFee - deliveredPayment; 
            
            // 3.1. Credita no saldo do Entregador
            await pool.execute('UPDATE users SET pending_balance = pending_balance + ? WHERE id = ?', [deliveredPayment, order.delivery_person_id]);
            
            // 3.2. Credita o lucro do Vendedor
             await pool.execute('UPDATE users SET pending_balance = pending_balance + ? WHERE id = ?', [sellerEarnings, order.seller_id]);

            // 3.3. Marca o entregador como DISPONÍVEL
            await pool.execute('UPDATE users SET is_available = TRUE WHERE id = ?', [order.delivery_person_id]);
            
            paymentMessage = `Entrega Marketplace confirmada. R$${deliveredPayment.toFixed(2)} creditados ao entregador.`;
        }
        
        // 4. Atualiza status da entrega e do pedido para finalizado, E REGISTRA O delivery_time
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
