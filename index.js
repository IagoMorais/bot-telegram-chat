const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Carrega as instruções base do arquivo
const INSTRUCTIONS_FILE = path.join(__dirname, 'instructions.txt');
const HISTORY_FILE = path.join(__dirname, 'conversations.json');

// Carrega histórico de conversas do arquivo JSON
let conversationHistory = loadConversationHistory();

// Função para carregar o histórico de conversas
function loadConversationHistory() {
    try {
        if (fs.existsSync(HISTORY_FILE)) {
            const data = fs.readFileSync(HISTORY_FILE, 'utf-8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Erro ao carregar histórico:', error);
    }
    return {};
}

// Função para salvar o histórico periodicamente
function saveHistoryInterval() {
    setInterval(() => {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(conversationHistory, null, 2));
        console.log('Histórico salvo automaticamente.');
    }, 30000); // Salva a cada 30 segundos
}

// Configurações da API de IA
const AI_CONFIG = {
    API_KEY: process.env.API_KEY, // Chave agora vem do .env
    ENDPOINT: process.env.API_ENDPOINT || '<https://api.openai.com/v1/chat/completions>',
    MODEL: process.env.API_MODEL || 'gpt-3.5-turbo'
};

// Função para ler instruções base
function readInstructions() {
    try {
        if (fs.existsSync(INSTRUCTIONS_FILE)) {
            return fs.readFileSync(INSTRUCTIONS_FILE, 'utf-8');
        }
    } catch (error) {
        console.error('Erro ao ler instruções:', error);
    }
    return "Você é um assistente útil que responde de forma natural e amigável.";
}

// Modificado para usar instruções do arquivo
async function processMessage(text, userId) {
    try {
        if (!conversationHistory[userId]) {
            conversationHistory[userId] = [];
        }

        conversationHistory[userId].push({ role: "user", content: text });

        // Limita histórico mantendo contexto
        if (conversationHistory[userId].length > 20) {
            conversationHistory[userId] = conversationHistory[userId].slice(-10);
        }

        const response = await axios.post(AI_CONFIG.ENDPOINT, {
            model: AI_CONFIG.MODEL,
            messages: [
                { role: "system", content: readInstructions() }, // Instruções dinâmicas
                ...conversationHistory[userId]
            ],
            temperature: 0.7,
            max_tokens: 500
        }, {
            headers: {
                'Authorization': `Bearer ${AI_CONFIG.API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        let reply = response.data.choices[0].message.content;
        conversationHistory[userId].push({ role: "assistant", content: reply });

        // Salva imediatamente após resposta
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(conversationHistory, null, 2));
        
        return reply;
    } catch (error) {
        console.error('Erro ao processar mensagem:', error.response?.data || error.message);
        return 'Desculpe, estou tendo dificuldades para responder no momento.';
    }
}

const client = new Client({
    authStrategy: new LocalAuth()
});

// Inicia o salvamento automático
saveHistoryInterval();

// Restante do código mantido igual...
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Client is ready!');
});

client.on('message', async (message) => {
    console.log(`Mensagem recebida de ${message.from}: ${message.body}`);
    const response = await processMessage(message.body, message.from);
    message.reply(response);
});

client.initialize();