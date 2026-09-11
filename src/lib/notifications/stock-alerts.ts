import {
  listActiveAlertsForProduct,
  markAlertNotified,
} from "@/lib/db/notifications-data";
import { notifyBackInStock, notifyPriceAlert } from "@/lib/notifications";
import { loadNotifyRecipient } from "@/lib/notifications/recipients";
import { getProductById } from "@/data/products";

export async function notifyWatchersBackInStock(
  productId: string,
  locationId?: string | null,
) {
  const product = getProductById(productId);
  if (!product) return;
  const alerts = await listActiveAlertsForProduct(productId, "back_in_stock", locationId);
  for (const alert of alerts) {
    const recipient = await loadNotifyRecipient(alert.user_id);
    if (!recipient) continue;
    await notifyBackInStock({
      userId: recipient.userId,
      email: recipient.email,
      productName: product.name,
      productId,
      prefs: recipient.prefs,
    });
    await markAlertNotified(alert.id);
  }
}

export async function notifyWatchersPriceDrop(
  productId: string,
  price: number,
  locationId?: string | null,
) {
  const product = getProductById(productId);
  if (!product) return;
  const alerts = await listActiveAlertsForProduct(productId, "price", locationId);
  for (const alert of alerts) {
    if (alert.target_price != null && price > Number(alert.target_price)) continue;
    const recipient = await loadNotifyRecipient(alert.user_id);
    if (!recipient) continue;
    await notifyPriceAlert({
      userId: recipient.userId,
      email: recipient.email,
      productName: product.name,
      productId,
      price,
      prefs: recipient.prefs,
    });
    await markAlertNotified(alert.id);
  }
}
