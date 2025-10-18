class EmailService {
    constructor() {
        this.config = EMAIL_CONFIG;
    }

    async checkHealth() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

            const response = await fetch(`${this.config.backend.url}${this.config.backend.healthEndpoint}`, {
                method: 'GET',
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                return { success: true, message: 'Backend raggiungibile' };
            } else {
                return { success: false, message: `Errore: ${response.status}` };
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                return { success: false, message: 'Timeout: Backend non raggiungibile' };
            }
            return { success: false, message: 'Errore di connessione al backend' };
        }
    }

    async sendEmail(formData) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

            const response = await fetch(`${this.config.backend.url}${this.config.backend.sendEndpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json();
                return { success: true, message: 'Email inviata con successo' };
            } else {
                return { success: false, message: 'Errore nell\'invio dell\'email' };
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                return { success: false, message: 'Timeout nell\'invio dell\'email' };
            }
            return { success: false, message: 'Errore di connessione durante l\'invio' };
        }
    }
}

const emailService = new EmailService();
