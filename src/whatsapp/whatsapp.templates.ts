import type { WhatsappParams, WhatsappTemplate } from './schemas/whatsapp-message.schema';

/** Renders the message text. `phone` is the normalised login phone. */
export function renderWhatsapp(
  template: WhatsappTemplate,
  params: WhatsappParams,
  phone: string,
): string {
  switch (template) {
    case 'CLIENT_PORTAL_INVITE': {
      const password = params.temporaryPassword
        ? `Password: ${params.temporaryPassword} (please change it after signing in)`
        : params.newAccount
          ? 'Password: ask your MACROPAGE contact to send it to you again.'
          : 'Password: your existing portal password.';
      return [
        `Hi ${params.name || 'there'},`,
        '',
        params.title
          ? `"${params.title}" has been shared with you on the MACROPAGE client portal.`
          : 'Your MACROPAGE client portal is ready.',
        '',
        `Portal: ${params.portalUrl}`,
        `Login: choose "Customer" and sign in with your phone number +${phone}`,
        password,
      ].join('\n');
    }
  }
}
