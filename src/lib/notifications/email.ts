import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendPriceDropAlert({ toEmail, productTitle, oldPrice, newPrice, productUrl, imageUrl }) {
  const savings = ((oldPrice - newPrice) / oldPrice * 100).toFixed(0)
  await resend.emails.send({
    from:    'PriceIQ <alertas@priceiq.com>',
    to:      toEmail,
    subject: '🎉 ' + productTitle + ' caiu ' + savings + '% de preco!',
    html: '<div style="font-family:sans-serif;max-width:500px;background:#111;color:#eee;border-radius:12px;overflow:hidden">'
      + '<div style="background:linear-gradient(135deg,#22c55e,#16a34a);padding:24px;text-align:center"><h1 style="color:white;margin:0">💸 Alerta de Preco!</h1></div>'
      + '<div style="padding:24px">'
      + '<img src="' + imageUrl + '" style="width:120px;border-radius:8px;margin-bottom:16px"/>'
      + '<h2 style="color:#eee;font-size:16px">' + productTitle + '</h2>'
      + '<p style="color:#888">De: <s style="color:#ef4444">R$ ' + oldPrice.toFixed(2) + '</s></p>'
      + '<p style="color:#22c55e;font-size:24px;font-weight:bold">R$ ' + newPrice.toFixed(2) + '</p>'
      + '<a href="' + productUrl + '" style="display:block;background:#22c55e;color:black;text-align:center;padding:14px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:20px">Ver Produto →</a>'
      + '</div></div>'
  })
}
