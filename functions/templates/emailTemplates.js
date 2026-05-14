const PRODUCT_IMAGE_BASE_URL = 'https://oliodivaleria.it/';

function buildProductImageUrl(image) {
    if (!image || typeof image !== 'string') return '';
    if (/^https?:\/\//i.test(image)) return image;
    return PRODUCT_IMAGE_BASE_URL + image.replace(/^\/+/, '');
}

function buildItemNameCell(item) {
    const name = item.name || 'Prodotto';
    const size = item.size || '';
    const imageUrl = buildProductImageUrl(item.image);
    const imgCell = imageUrl
        ? `<td style="padding: 0 12px 0 0; vertical-align: middle; width: 64px;"><img src="${imageUrl}" alt="${name}" width="60" height="60" style="display:block; border-radius:6px; object-fit:cover; border:1px solid #e5e7eb;"></td>`
        : '';
    const sizeLine = size ? `<div style="font-size: 12px; color: #6b7280; margin-top: 2px;">${size}</div>` : '';
    return `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;"><tr>${imgCell}<td style="vertical-align: middle;"><div style="font-weight: 600; color: #1a202c;">${name}</div>${sizeLine}</td></tr></table>`;
}

const emailStyles = `
  body {
    margin: 0;
    padding: 0;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background-color: #f5f5f5;
  }
  .email-container {
    max-width: 600px;
    margin: 0 auto;
    background-color: #ffffff;
  }
  .email-header {
    background-color: #000000;
    color: #eab308;
    padding: 30px 20px;
    text-align: center;
  }
  .email-header h1 {
    margin: 0;
    font-size: 28px;
    font-weight: bold;
  }
  .email-body {
    padding: 30px 20px;
    color: #333333;
  }
  .greeting {
    font-size: 18px;
    margin-bottom: 20px;
    color: #000000;
  }
  .order-info {
    background-color: #f9fafb;
    border: 2px solid #eab308;
    border-radius: 8px;
    padding: 20px;
    margin: 20px 0;
  }
  .order-info h2 {
    margin: 0 0 15px 0;
    color: #000000;
    font-size: 20px;
  }
  .order-detail {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid #e5e7eb;
  }
  .order-detail:last-child {
    border-bottom: none;
  }
  .order-detail-label {
    font-weight: 600;
    color: #6b7280;
  }
  .order-detail-value {
    color: #000000;
  }
  .items-table {
    width: 100%;
    border-collapse: collapse;
    margin: 20px 0;
  }
  .items-table th {
    background-color: #000000;
    color: #eab308;
    padding: 12px;
    text-align: left;
    font-weight: 600;
  }
  .items-table td {
    padding: 12px;
    border-bottom: 1px solid #e5e7eb;
  }
  .items-table tr:last-child td {
    border-bottom: none;
  }
  .total-row {
    background-color: #fffbeb;
    font-weight: bold;
  }
  .status-badge {
    display: inline-block;
    padding: 6px 12px;
    border-radius: 6px;
    font-weight: 600;
    font-size: 14px;
  }
  .status-pending {
    background-color: #fef3c7;
    color: #f59e0b;
  }
  .status-processing {
    background-color: #dbeafe;
    color: #3b82f6;
  }
  .status-shipped {
    background-color: #ede9fe;
    color: #8b5cf6;
  }
  .status-delivered {
    background-color: #d1fae5;
    color: #10b981;
  }
  .status-paid {
    background-color: #d1fae5;
    color: #10b981;
  }
  .cta-button {
    display: inline-block;
    background-color: #eab308;
    color: #000000;
    padding: 12px 30px;
    text-decoration: none;
    border-radius: 6px;
    font-weight: bold;
    margin: 20px 0;
  }
  .email-footer {
    background-color: #f9fafb;
    padding: 20px;
    text-align: center;
    color: #6b7280;
    font-size: 14px;
  }
  .footer-links {
    margin-top: 15px;
  }
  .footer-links a {
    color: #eab308;
    text-decoration: none;
    margin: 0 10px;
  }
`;

function generateOrderConfirmationEmail({ orderId, customerName, orderDetails }) {
    const { items, subtotal, shipping, total, paymentMethod, paymentStatus, shippingAddress } = orderDetails;
    
    const itemsHtml = items.map(item => `
        <tr>
            <td>${buildItemNameCell(item)}</td>
            <td style="text-align: center; vertical-align: middle;">${item.quantity || 1}</td>
            <td style="text-align: right; vertical-align: middle;">€${(item.price || 0).toFixed(2)}</td>
            <td style="text-align: right; vertical-align: middle;">€${((item.price || 0) * (item.quantity || 1)).toFixed(2)}</td>
        </tr>
    `).join('');

    const paymentStatusText = paymentStatus === 'paid' 
        ? '<span class="status-badge status-paid">✓ Pagamento Confermato</span>'
        : '<span class="status-badge status-pending">⏳ In Attesa di Pagamento</span>';

    const paymentInstructions = paymentMethod === 'bank_transfer' || paymentMethod === 'IBAN'
        ? `
            <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
                <h3 style="margin: 0 0 10px 0; color: #f59e0b;">Istruzioni per il Bonifico Bancario</h3>
                <p style="margin: 5px 0;"><strong>Beneficiario:</strong> L'Olio di Valeria di Licata Valeria</p>
                <p style="margin: 5px 0;"><strong>IBAN:</strong> IT77 T360 8105 1382 7272 0072 768</p>
                <p style="margin: 5px 0;"><strong>BIC/SWIFT:</strong> BPPIITRRXXX</p>
                <p style="margin: 5px 0;"><strong>Banca:</strong> Poste Italiane S.p.A</p>
                <p style="margin: 5px 0;"><strong>Causale:</strong> Ordine #${orderId}</p>
                <p style="margin: 5px 0;"><strong>Importo:</strong> €${total.toFixed(2)}</p>
                <p style="margin: 10px 0 0 0; font-size: 14px; color: #6b7280;">
                    Il tuo ordine verrà spedito dopo la ricezione del pagamento (1-3 giorni lavorativi).
                </p>
            </div>
        `
        : '';

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Conferma Ordine</title>
    <style>${emailStyles}</style>
</head>
<body>
    <div class="email-container">
        <div class="email-header">
            <img src="https://oliodivaleria.it/assets/oliodivaleria.png" alt="l'Olio di Valeria" style="max-width: 300px; height: auto; margin-bottom: 15px;">
            <p style="margin: 10px 0 0 0; font-size: 16px;">Conferma Ordine</p>
        </div>
        
        <div class="email-body">
            <p class="greeting">Ciao ${customerName},</p>
            
            <p>Grazie per il tuo ordine! Abbiamo ricevuto la tua richiesta e la stiamo elaborando.</p>
            
            <div class="order-info">
                <h2>Dettagli Ordine #${orderId}</h2>
                <div class="order-detail">
                    <span class="order-detail-label">Numero Ordine:</span>
                    <span class="order-detail-value">${orderId}</span>
                </div>
                <div class="order-detail">
                    <span class="order-detail-label">Stato Pagamento:</span>
                    <span class="order-detail-value">${paymentStatusText}</span>
                </div>
                <div class="order-detail">
                    <span class="order-detail-label">Metodo di Pagamento:</span>
                    <span class="order-detail-value">${formatPaymentMethod(paymentMethod)}</span>
                </div>
                <div class="order-detail">
                    <span class="order-detail-label">Indirizzo di Spedizione:</span>
                    <span class="order-detail-value">${shippingAddress}</span>
                </div>
            </div>

            ${paymentInstructions}
            
            <table class="items-table">
                <thead>
                    <tr>
                        <th>Prodotto</th>
                        <th style="text-align: center;">Quantità</th>
                        <th style="text-align: right;">Prezzo</th>
                        <th style="text-align: right;">Totale</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                    <tr>
                        <td colspan="3" style="text-align: right; font-weight: 600;">Subtotale:</td>
                        <td style="text-align: right;">€${subtotal.toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td colspan="3" style="text-align: right; font-weight: 600;">Spedizione:</td>
                        <td style="text-align: right;">€${shipping.toFixed(2)}</td>
                    </tr>
                    <tr class="total-row">
                        <td colspan="3" style="text-align: right; font-weight: bold; font-size: 18px;">TOTALE:</td>
                        <td style="text-align: right; font-weight: bold; font-size: 18px;">€${total.toFixed(2)}</td>
                    </tr>
                </tbody>
            </table>
            
            <p>Riceverai una notifica via email quando il tuo ordine verrà spedito.</p>
            
            <p style="margin-top: 30px;">
                <a href="https://oliodivaleria.it" class="cta-button">Visita il Nostro Sito</a>
            </p>
            
            <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">
                Se hai domande sul tuo ordine, non esitare a contattarci.
            </p>
        </div>
        
        <div class="email-footer">
            <p><strong>l'Olio di Valeria</strong></p>
            <p>Olio extravergine d'oliva di qualità superiore</p>
            <div class="footer-links">
                <a href="https://oliodivaleria.it">Sito Web</a> |
                <a href="mailto:info@oliodivaleria.it">Contattaci</a> |
                <a href="https://oliodivaleria.it/shop.html">Shop</a>
            </div>
            <p style="margin-top: 15px; font-size: 12px;">
                © 2025 l'Olio di Valeria. Tutti i diritti riservati.
            </p>
        </div>
    </div>
</body>
</html>
    `;
}

function generateOrderStatusUpdateEmail({ orderId, customerName, oldStatus, newStatus, orderDetails }) {
    const { items, total } = orderDetails;
    
    const statusInfo = getStatusInfo(newStatus);
    const statusMessage = getStatusMessage(newStatus);
    
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Aggiornamento Ordine</title>
    <style>${emailStyles}</style>
</head>
<body>
    <div class="email-container">
        <div class="email-header">
            <img src="https://oliodivaleria.it/assets/oliodivaleria.png" alt="l'Olio di Valeria" style="max-width: 300px; height: auto; margin-bottom: 15px;">
            <p style="margin: 10px 0 0 0; font-size: 16px;">Aggiornamento Ordine</p>
        </div>
        
        <div class="email-body">
            <p class="greeting">Ciao ${customerName},</p>
            
            <p>Il tuo ordine è stato aggiornato!</p>
            
            <div class="order-info">
                <h2>Ordine #${orderId}</h2>
                <div class="order-detail">
                    <span class="order-detail-label">Nuovo Stato:</span>
                    <span class="order-detail-value">
                        <span class="status-badge status-${newStatus}">${statusInfo.icon} ${statusInfo.label}</span>
                    </span>
                </div>
                <div class="order-detail">
                    <span class="order-detail-label">Totale Ordine:</span>
                    <span class="order-detail-value">€${total.toFixed(2)}</span>
                </div>
            </div>
            
            <div style="background-color: ${statusInfo.bgColor}; border-left: 4px solid ${statusInfo.color}; padding: 15px; margin: 20px 0;">
                <p style="margin: 0; color: ${statusInfo.color}; font-weight: 600;">
                    ${statusMessage}
                </p>
            </div>
            
            ${newStatus === 'shipped' ? `
                <p>Il tuo pacco è in viaggio! Riceverai un'email con il numero di tracciamento a breve.</p>
            ` : ''}
            
            ${newStatus === 'delivered' ? `
                <p>Speriamo che tu sia soddisfatto del tuo acquisto! Se hai domande o commenti, non esitare a contattarci.</p>
            ` : ''}
            
            <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">
                Se hai domande sul tuo ordine, non esitare a contattarci.
            </p>
        </div>
        
        <div class="email-footer">
            <p><strong>l'Olio di Valeria</strong></p>
            <p>Olio extravergine d'oliva di qualità superiore</p>
            <div class="footer-links">
                <a href="https://oliodivaleria.it">Sito Web</a> |
                <a href="mailto:info@oliodivaleria.it">Contattaci</a>
            </div>
            <p style="margin-top: 15px; font-size: 12px;">
                © 2025 l'Olio di Valeria. Tutti i diritti riservati.
            </p>
        </div>
    </div>
</body>
</html>
    `;
}

function generatePaymentReceiptEmail({ orderId, customerName, orderDetails }) {
    const { items, subtotal, shipping, total, paymentMethod, paymentTimestamp } = orderDetails || {};
    
    // Ensure items is an array
    const safeItems = Array.isArray(items) ? items : [];
    
    // Ensure financial values are numbers with defaults
    const safeSubtotal = typeof subtotal === 'number' ? subtotal : (subtotal ? parseFloat(subtotal) : 0);
    const safeShipping = typeof shipping === 'number' ? shipping : (shipping ? parseFloat(shipping) : 0);
    const safeTotal = typeof total === 'number' ? total : (total ? parseFloat(total) : safeSubtotal + safeShipping);
    
    const itemsHtml = safeItems.length > 0 
        ? safeItems.map(item => {
            const itemPrice = item.price || item.unitPrice || item.pricePerUnit || 0;
            const itemQuantity = item.quantity || 1;
            const itemTotal = itemPrice * itemQuantity;
            
            return `
        <tr>
            <td>${buildItemNameCell(item)}</td>
            <td style="text-align: center; vertical-align: middle;">${itemQuantity}</td>
            <td style="text-align: right; vertical-align: middle;">€${itemPrice.toFixed(2)}</td>
            <td style="text-align: right; vertical-align: middle;">€${itemTotal.toFixed(2)}</td>
        </tr>
    `;
        }).join('')
        : '<tr><td colspan="4" style="text-align: center;">Nessun articolo disponibile</td></tr>';

    // Handle paymentTimestamp - can be Firestore Timestamp object or Date
    let paymentDate;
    try {
        if (paymentTimestamp) {
            if (paymentTimestamp.seconds) {
                // Firestore Timestamp
                paymentDate = new Date(paymentTimestamp.seconds * 1000).toLocaleDateString('it-IT');
            } else if (paymentTimestamp.toDate) {
                // Firestore Timestamp with toDate method
                paymentDate = paymentTimestamp.toDate().toLocaleDateString('it-IT');
            } else if (paymentTimestamp instanceof Date) {
                // Already a Date object
                paymentDate = paymentTimestamp.toLocaleDateString('it-IT');
            } else {
                // Try to parse as timestamp
                paymentDate = new Date(paymentTimestamp).toLocaleDateString('it-IT');
            }
        } else {
            paymentDate = new Date().toLocaleDateString('it-IT');
        }
    } catch (dateError) {
        console.error('[Email Template] Error parsing payment date:', dateError);
        paymentDate = new Date().toLocaleDateString('it-IT');
    }

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ricevuta Pagamento</title>
    <style>${emailStyles}</style>
</head>
<body>
    <div class="email-container">
        <div class="email-header">
            <img src="https://oliodivaleria.it/assets/oliodivaleria.png" alt="l'Olio di Valeria" style="max-width: 300px; height: auto; margin-bottom: 15px;">
            <p style="margin: 10px 0 0 0; font-size: 16px;">Ricevuta Pagamento</p>
        </div>
        
        <div class="email-body">
            <p class="greeting">Ciao ${customerName},</p>
            
            <p>Abbiamo ricevuto il tuo pagamento con successo!</p>
            
            <div class="order-info">
                <h2>Ricevuta #${orderId}</h2>
                <div class="order-detail">
                    <span class="order-detail-label">Numero Ordine:</span>
                    <span class="order-detail-value">${orderId}</span>
                </div>
                <div class="order-detail">
                    <span class="order-detail-label">Data Pagamento:</span>
                    <span class="order-detail-value">${paymentDate}</span>
                </div>
                <div class="order-detail">
                    <span class="order-detail-label">Metodo di Pagamento:</span>
                    <span class="order-detail-value">${formatPaymentMethod(paymentMethod || 'card')}</span>
                </div>
                <div class="order-detail">
                    <span class="order-detail-label">Stato:</span>
                    <span class="order-detail-value">
                        <span class="status-badge status-paid">✓ Pagato</span>
                    </span>
                </div>
            </div>
            
            <table class="items-table">
                <thead>
                    <tr>
                        <th>Prodotto</th>
                        <th style="text-align: center;">Quantità</th>
                        <th style="text-align: right;">Prezzo</th>
                        <th style="text-align: right;">Totale</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                    <tr>
                        <td colspan="3" style="text-align: right; font-weight: 600;">Subtotale:</td>
                        <td style="text-align: right;">€${safeSubtotal.toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td colspan="3" style="text-align: right; font-weight: 600;">Spedizione:</td>
                        <td style="text-align: right;">€${safeShipping.toFixed(2)}</td>
                    </tr>
                    <tr class="total-row">
                        <td colspan="3" style="text-align: right; font-weight: bold; font-size: 18px;">TOTALE PAGATO:</td>
                        <td style="text-align: right; font-weight: bold; font-size: 18px;">€${safeTotal.toFixed(2)}</td>
                    </tr>
                </tbody>
            </table>
            
            <div style="background-color: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0;">
                <p style="margin: 0; color: #10b981; font-weight: 600;">
                    ✓ Pagamento confermato! Il tuo ordine verrà spedito a breve.
                </p>
            </div>
            
            <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">
                Conserva questa email come ricevuta del tuo acquisto.
            </p>
        </div>
        
        <div class="email-footer">
            <p><strong>l'Olio di Valeria</strong></p>
            <p>Olio extravergine d'oliva di qualità superiore</p>
            <div class="footer-links">
                <a href="https://oliodivaleria.it">Sito Web</a> |
                <a href="mailto:info@oliodivaleria.it">Contattaci</a>
            </div>
            <p style="margin-top: 15px; font-size: 12px;">
                © 2025 l'Olio di Valeria. Tutti i diritti riservati.
            </p>
        </div>
    </div>
</body>
</html>
    `;
}

function generateAdminOrderNotificationEmail({ orderId, documentId, orderDetails }) {
    const { items, subtotal, shipping, total, paymentMethod, paymentStatus, customerInfo } = orderDetails;
    
    const itemsHtml = items.map(item => `
        <tr>
            <td>${buildItemNameCell(item)}</td>
            <td style="text-align: center; vertical-align: middle;">${item.quantity || 1}</td>
            <td style="text-align: right; vertical-align: middle;">€${(item.price || 0).toFixed(2)}</td>
            <td style="text-align: right; vertical-align: middle;">€${((item.price || 0) * (item.quantity || 1)).toFixed(2)}</td>
        </tr>
    `).join('');

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Nuovo Ordine Ricevuto</title>
    <style>${emailStyles}</style>
</head>
<body>
    <div class="email-container">
        <div class="email-header" style="background-color: #eab308; color: #000000;">
            <img src="https://oliodivaleria.it/assets/oliodivaleria.png" alt="l'Olio di Valeria" style="max-width: 300px; height: auto; margin-bottom: 15px;">
            <h1>Nuovo Ordine Ricevuto</h1>
            <p style="margin: 10px 0 0 0; font-size: 16px;">Admin Notification</p>
        </div>
        
        <div class="email-body">
            <p class="greeting">Nuovo ordine ricevuto!</p>
            
            <div class="order-info">
                <h2>Ordine #${orderId}</h2>
                <div class="order-detail">
                    <span class="order-detail-label">Cliente:</span>
                    <span class="order-detail-value">${customerInfo.name || 'N/A'}</span>
                </div>
                <div class="order-detail">
                    <span class="order-detail-label">Email:</span>
                    <span class="order-detail-value">${customerInfo.email || 'N/A'}</span>
                </div>
                <div class="order-detail">
                    <span class="order-detail-label">Telefono:</span>
                    <span class="order-detail-value">${customerInfo.phone || 'N/A'}</span>
                </div>
                ${customerInfo.company ? `
                <div class="order-detail">
                    <span class="order-detail-label">Azienda:</span>
                    <span class="order-detail-value">${customerInfo.company}</span>
                </div>
                ` : ''}
                <div class="order-detail">
                    <span class="order-detail-label">Indirizzo:</span>
                    <span class="order-detail-value">${formatCustomerAddress(customerInfo)}</span>
                </div>
                <div class="order-detail">
                    <span class="order-detail-label">Metodo di Pagamento:</span>
                    <span class="order-detail-value">${formatPaymentMethod(paymentMethod)}</span>
                </div>
                <div class="order-detail">
                    <span class="order-detail-label">Stato Pagamento:</span>
                    <span class="order-detail-value">
                        <span class="status-badge ${paymentStatus === 'paid' ? 'status-paid' : 'status-pending'}">
                            ${paymentStatus === 'paid' ? '✓ Pagato' : '⏳ In Attesa'}
                        </span>
                    </span>
                </div>
                ${customerInfo.notes ? `
                <div class="order-detail">
                    <span class="order-detail-label">Note Cliente:</span>
                    <span class="order-detail-value">${customerInfo.notes}</span>
                </div>
                ` : ''}
            </div>
            
            <table class="items-table">
                <thead>
                    <tr>
                        <th>Prodotto</th>
                        <th style="text-align: center;">Quantità</th>
                        <th style="text-align: right;">Prezzo</th>
                        <th style="text-align: right;">Totale</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                    <tr>
                        <td colspan="3" style="text-align: right; font-weight: 600;">Subtotale:</td>
                        <td style="text-align: right;">€${subtotal.toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td colspan="3" style="text-align: right; font-weight: 600;">Spedizione:</td>
                        <td style="text-align: right;">€${shipping.toFixed(2)}</td>
                    </tr>
                    <tr class="total-row">
                        <td colspan="3" style="text-align: right; font-weight: bold; font-size: 18px;">TOTALE:</td>
                        <td style="text-align: right; font-weight: bold; font-size: 18px;">€${total.toFixed(2)}</td>
                    </tr>
                </tbody>
            </table>
            
            <p style="margin-top: 30px;">
                <a href="https://oliodivaleria.it/dashboard_order_detail.html?id=${documentId || orderId}" class="cta-button">
                    Visualizza Ordine nel Dashboard
                </a>
            </p>
        </div>
        
        <div class="email-footer">
            <p><strong>l'Olio di Valeria Admin System</strong></p>
            <p style="margin-top: 15px; font-size: 12px;">
                Questa è una notifica automatica generata dal sistema.
            </p>
        </div>
    </div>
</body>
</html>
    `;
}

function formatPaymentMethod(method) {
    const methodMap = {
        'bank_transfer': 'Bonifico Bancario',
        'IBAN': 'Bonifico Bancario',
        'card': 'Carta di Credito',
        'credit card': 'Carta di Credito',
        'debit card': 'Carta di Debito',
        'paypal': 'PayPal',
        'PayPal': 'PayPal',
        'Apple Pay': 'Apple Pay',
        'Google Pay': 'Google Pay'
    };
    return methodMap[method] || method || 'N/A';
}

function formatCustomerAddress(customerInfo) {
    const parts = [];
    if (customerInfo.address) {
        const street = customerInfo.houseNumber 
            ? `${customerInfo.address}, ${customerInfo.houseNumber}`
            : customerInfo.address;
        parts.push(street);
    }
    
    const cityLine = [];
    if (customerInfo.postalCode) cityLine.push(customerInfo.postalCode);
    if (customerInfo.city) cityLine.push(customerInfo.city);
    if (cityLine.length > 0) parts.push(cityLine.join(' '));
    
    if (customerInfo.province) parts.push(customerInfo.province);
    if (customerInfo.country) parts.push(customerInfo.country);
    
    return parts.length > 0 ? parts.join(', ') : 'N/A';
}

function getStatusInfo(status) {
    const statusMap = {
        'pending': { label: 'In attesa', color: '#f59e0b', bgColor: '#fef3c7', icon: '⏳' },
        'processing': { label: 'In elaborazione', color: '#3b82f6', bgColor: '#dbeafe', icon: '⚙️' },
        'shipped': { label: 'Spedito', color: '#8b5cf6', bgColor: '#ede9fe', icon: '📦' },
        'delivered': { label: 'Consegnato', color: '#10b981', bgColor: '#d1fae5', icon: '✅' },
        'cancelled': { label: 'Annullato', color: '#ef4444', bgColor: '#fee2e2', icon: '❌' }
    };
    return statusMap[status] || { label: status, color: '#6b7280', bgColor: '#f3f4f6', icon: '?' };
}

function getStatusMessage(status) {
    const messages = {
        'pending': 'Il tuo ordine è stato ricevuto ed è in attesa di elaborazione.',
        'processing': 'Il tuo ordine è in fase di elaborazione e verrà spedito a breve.',
        'shipped': 'Il tuo ordine è stato spedito ed è in viaggio verso di te!',
        'delivered': 'Il tuo ordine è stato consegnato con successo. Grazie per il tuo acquisto!',
        'cancelled': 'Il tuo ordine è stato annullato. Se hai domande, contattaci.'
    };
    return messages[status] || 'Il tuo ordine è stato aggiornato.';
}

function generateContactConfirmationEmail({ name, email, phone, inquiry, message, timestamp }) {
    const formattedDate = timestamp 
        ? (timestamp instanceof Date ? timestamp.toLocaleString('it-IT') : new Date(timestamp).toLocaleString('it-IT'))
        : new Date().toLocaleString('it-IT');

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Conferma Ricezione Messaggio</title>
    <style>${emailStyles}</style>
</head>
<body>
    <div class="email-container">
        <div class="email-header">
            <img src="https://oliodivaleria.it/assets/oliodivaleria.png" alt="l'Olio di Valeria" style="max-width: 300px; height: auto; margin-bottom: 15px;">
            <p style="margin: 10px 0 0 0; font-size: 16px;">Conferma Ricezione Messaggio</p>
        </div>
        
        <div class="email-body">
            <p class="greeting">Ciao ${name},</p>
            
            <p>Grazie per averci contattato! Abbiamo ricevuto il tuo messaggio e ti confermiamo che è stato inviato con successo.</p>
            
            <div class="order-info">
                <h2>Riepilogo del Tuo Messaggio</h2>
                <div class="order-detail">
                    <span class="order-detail-label">Data e Ora:</span>
                    <span class="order-detail-value">${formattedDate}</span>
                </div>
                ${inquiry ? `
                <div class="order-detail">
                    <span class="order-detail-label">Tipo di Richiesta:</span>
                    <span class="order-detail-value">${inquiry}</span>
                </div>
                ` : ''}
            </div>
            
            <p style="margin-top: 20px;">Il nostro team esaminerà la tua richiesta e ti risponderà il prima possibile. Apprezziamo la tua pazienza.</p>
            
            <p>Se hai domande urgenti, puoi contattarci direttamente:</p>
            <ul style="margin: 15px 0; padding-left: 20px; color: #333333;">
                <li><strong>Telefono:</strong> +39 327 309 8513</li>
                <li><strong>Email:</strong> <a href="mailto:info@oliodivaleria.it" style="color: #eab308; text-decoration: none;">info@oliodivaleria.it</a></li>
            </ul>
            
            <p style="margin-top: 30px;">Cordiali saluti,<br><strong>Il Team di l'Olio di Valeria</strong></p>
        </div>
        
        <div class="email-footer">
            <p><strong>l'Olio di Valeria</strong></p>
            <p style="margin-top: 10px; font-size: 14px;">San Biagio Platani (AG), Sicilia</p>
            <div class="footer-links">
                <a href="https://oliodivaleria.it">Visita il nostro sito</a>
                <a href="https://oliodivaleria.it/contatti.html">Contatti</a>
            </div>
            <p style="margin-top: 15px; font-size: 12px; color: #9ca3af;">
                Questa è una email automatica di conferma. Per favore, non rispondere a questa email.
            </p>
        </div>
    </div>
</body>
</html>
    `;
}

function generateAdminContactNotificationEmail({ name, email, phone, inquiry, message, timestamp, ip }) {
    const formattedDate = timestamp 
        ? new Date(timestamp.seconds * 1000).toLocaleString('it-IT')
        : new Date().toLocaleString('it-IT');

    const inquiryLabel = inquiry 
        ? `<div class="order-detail">
            <span class="order-detail-label">Tipo di Richiesta:</span>
            <span class="order-detail-value">${inquiry}</span>
          </div>`
        : '';

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Nuovo Messaggio di Contatto</title>
    <style>${emailStyles}</style>
</head>
<body>
    <div class="email-container">
        <div class="email-header" style="background-color: #eab308; color: #000000;">
            <img src="https://oliodivaleria.it/assets/oliodivaleria.png" alt="l'Olio di Valeria" style="max-width: 300px; height: auto; margin-bottom: 15px;">
            <h1>Nuovo Messaggio di Contatto</h1>
            <p style="margin: 10px 0 0 0; font-size: 16px;">Admin Notification</p>
        </div>
        
        <div class="email-body">
            <p class="greeting">Hai ricevuto un nuovo messaggio dal modulo di contatto!</p>
            
            <div class="order-info">
                <h2>Dettagli Contatto</h2>
                <div class="order-detail">
                    <span class="order-detail-label">Nome:</span>
                    <span class="order-detail-value">${name}</span>
                </div>
                <div class="order-detail">
                    <span class="order-detail-label">Email:</span>
                    <span class="order-detail-value"><a href="mailto:${email}" style="color: #eab308; text-decoration: none;">${email}</a></span>
                </div>
                ${phone ? `
                <div class="order-detail">
                    <span class="order-detail-label">Telefono:</span>
                    <span class="order-detail-value">${phone}</span>
                </div>
                ` : ''}
                ${inquiryLabel}
                <div class="order-detail">
                    <span class="order-detail-label">Data e Ora:</span>
                    <span class="order-detail-value">${formattedDate}</span>
                </div>
                <div class="order-detail">
                    <span class="order-detail-label">IP Address:</span>
                    <span class="order-detail-value">${ip || 'N/A'}</span>
                </div>
            </div>
            
            <div style="background-color: #f9fafb; border: 2px solid #eab308; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <h3 style="margin: 0 0 15px 0; color: #000000;">Messaggio:</h3>
                <p style="margin: 0; white-space: pre-wrap; color: #333333; line-height: 1.6;">${message}</p>
            </div>
            
            <p style="margin-top: 30px;">
                <a href="mailto:${email}" class="cta-button">Rispondi al Cliente</a>
            </p>
        </div>
        
        <div class="email-footer">
            <p><strong>l'Olio di Valeria Admin System</strong></p>
            <p style="margin-top: 15px; font-size: 12px;">
                Questa è una notifica automatica generata dal sistema.
            </p>
        </div>
    </div>
</body>
</html>
    `;
}

module.exports = {
    generateOrderConfirmationEmail,
    generateOrderStatusUpdateEmail,
    generatePaymentReceiptEmail,
    generateAdminOrderNotificationEmail,
    generateContactConfirmationEmail,
    generateAdminContactNotificationEmail
};
