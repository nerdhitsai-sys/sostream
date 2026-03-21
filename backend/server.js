/**
 * SOSTREAM - PREMIUM STREAMING AGGREGATOR BACKEND
 * Core: Node.js / Express / PostgreSQL (Direct Driver)
 * Design Pattern: Unified Hybrid Server (Controllers + Routes + Middleware)
 * Language: PT-BR
 */

const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

// ==========================================
// 1. CONFIGURAÇÕES INICIAIS
// ==========================================
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

// Pool de Conexão Postgres (Neon.tech)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Middleware Global
app.use(helmet()); // Segurança de Headers
app.use(cors());   // Cross-Origin Resource Sharing
app.use(express.json()); // Body Parser
app.use(morgan('dev')); // Logger de Requisições

// ==========================================
// 2. MIDDLEWARES DE SEGURANÇA
// ==========================================

/**
 * Middleware para validar o token JWT e injetar o usuário na request
 */
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: "Acesso negado. Token não fornecido." });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Token inválido ou expirado." });
        req.user = user;
        next();
    });
};

/**
 * Middleware para logs de erro globais
 */
const errorHandler = (err, req, res, next) => {
    console.error(`[ERRO CRÍTICO]: ${err.stack}`);
    res.status(500).json({
        error: "Ocorreu um erro interno no servidor Sostream.",
        details: process.env.NODE_ENV === 'development' ? err.message : null
    });
};

// ==========================================
// 3. CONTROLADORES (LÓGICA DE NEGÓCIO)
// ==========================================

const AuthController = {
    async register(req, res) {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ error: "Preencha todos os campos obrigatórios." });
        }

        try {
            const userExists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
            if (userExists.rows.length > 0) {
                return res.status(400).json({ error: "Este e-mail já está em uso." });
            }

            const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_SALT));
            const hash = await bcrypt.hash(password, salt);

            const newUser = await pool.query(
                'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, is_premium',
                [name, email, hash]
            );

            const token = jwt.sign({ id: newUser.rows[0].id, email: newUser.rows[0].email }, JWT_SECRET, { expiresIn: '7d' });

            res.status(201).json({ user: newUser.rows[0], token });
        } catch (err) {
            throw err;
        }
    },

    async login(req, res) {
        const { email, password } = req.body;
        try {
            const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
            const user = result.rows[0];

            if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

            const validPass = await bcrypt.compare(password, user.password_hash);
            if (!validPass) return res.status(401).json({ error: "Senha incorreta." });

            const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

            // Remover hash do objeto de retorno
            delete user.password_hash;
            res.json({ user, token });
        } catch (err) {
            throw err;
        }
    }
};

const MediaController = {
    async getDiscovery(req, res) {
        try {
            // Hero / Destaque (Geralmente o Trending mais recente)
            const hero = await pool.query(`
                SELECT m.*, c.name as category_name
                FROM media m
                LEFT JOIN categories c ON m.category_id = c.id
                WHERE m.is_trending = true
                LIMIT 1
            `);

            // Trending List
            const trending = await pool.query(`
                SELECT id, title, poster_url, rating, type
                FROM media
                WHERE is_trending = true
                ORDER BY created_at DESC
            `);

            // Categorias com Mídias (Agrupamento via SQL JSON)
            const categories = await pool.query(`
                SELECT c.name as category_title,
                json_agg(json_build_object('id', m.id, 'title', m.title, 'poster', m.poster_url)) as items
                FROM categories c
                JOIN media m ON m.category_id = c.id
                GROUP BY c.id
                LIMIT 5
            `);

            res.json({
                hero: hero.rows[0],
                trending: trending.rows,
                sections: categories.rows
            });
        } catch (err) {
            throw err;
        }
    },

    async getDetails(req, res) {
        const { id } = req.params;
        try {
            const media = await pool.query(`
                SELECT m.*, c.name as category_name
                FROM media m
                LEFT JOIN categories c ON m.category_id = c.id
                WHERE m.id = $1`, [id]
            );

            if (media.rows.length === 0) return res.status(404).json({ error: "Conteúdo não encontrado." });

            const seasons = await pool.query(`
                SELECT s.id, s.season_number, s.title,
                (SELECT json_agg(e.* ORDER BY e.episode_number)
                 FROM episodes e WHERE e.season_id = s.id) as episodes
                FROM seasons s
                WHERE s.media_id = $1
                ORDER BY s.season_number ASC
            `, [id]);

            res.json({
                ...media.rows[0],
                seasons: seasons.rows
            });
        } catch (err) {
            throw err;
        }
    },

    async search(req, res) {
        const { q } = req.query;
        if (!q) return res.json([]);
        try {
            const results = await pool.query(`
                SELECT id, title, poster_url, type, rating
                FROM media
                WHERE title ILIKE $1 OR synopsis ILIKE $1
                LIMIT 20
            `, [`%${q}%`]);
            res.json(results.rows);
        } catch (err) {
            throw err;
        }
    }
};

const UserFeatureController = {
    async toggleFavorite(req, res) {
        const { mediaId } = req.body;
        const userId = req.user.id;
        try {
            const exists = await pool.query('SELECT 1 FROM favorites WHERE user_id = $1 AND media_id = $2', [userId, mediaId]);

            if (exists.rows.length > 0) {
                await pool.query('DELETE FROM favorites WHERE user_id = $1 AND media_id = $2', [userId, mediaId]);
                return res.json({ status: "removed", message: "Removido da lista." });
            } else {
                await pool.query('INSERT INTO favorites (user_id, media_id) VALUES ($1, $2)', [userId, mediaId]);
                return res.json({ status: "added", message: "Adicionado à sua lista." });
            }
        } catch (err) {
            throw err;
        }
    },

    async getFavorites(req, res) {
        const userId = req.user.id;
        try {
            const favs = await pool.query(`
                SELECT m.* FROM media m
                INNER JOIN favorites f ON f.media_id = m.id
                WHERE f.user_id = $1
            `, [userId]);
            res.json(favs.rows);
        } catch (err) {
            throw err;
        }
    },

    async updateProgress(req, res) {
        const { episodeId, progress, total } = req.body;
        const userId = req.user.id;
        try {
            await pool.query(`
                INSERT INTO watch_history (user_id, episode_id, progress_seconds, total_seconds, last_watched)
                VALUES ($1, $2, $3, $4, NOW())
                ON CONFLICT (user_id, episode_id) DO UPDATE SET
                progress_seconds = $3, total_seconds = $4, last_watched = NOW()
            `, [userId, episodeId, progress, total]);
            res.json({ success: true });
        } catch (err) {
            throw err;
        }
    },

    async getContinueWatching(req, res) {
        const userId = req.user.id;
        try {
            const list = await pool.query(`
                SELECT wh.progress_seconds, wh.total_seconds, e.title as ep_title, e.episode_number,
                       m.id as media_id, m.title as media_title, m.poster_url, m.banner_url
                FROM watch_history wh
                JOIN episodes e ON wh.episode_id = e.id
                JOIN seasons s ON e.season_id = s.id
                JOIN media m ON s.media_id = m.id
                WHERE wh.user_id = $1
                ORDER BY wh.last_watched DESC
                LIMIT 10
            `, [userId]);
            res.json(list.rows);
        } catch (err) {
            throw err;
        }
    }
};

const ProfileController = {
    async getProfile(req, res) {
        try {
            const result = await pool.query('SELECT id, name, email, avatar_url, is_premium, created_at FROM users WHERE id = $1', [req.user.id]);
            res.json(result.rows[0]);
        } catch (err) {
            throw err;
        }
    },

    async upgradeToPremium(req, res) {
        try {
            await pool.query('UPDATE users SET is_premium = true WHERE id = $1', [req.user.id]);
            res.json({ success: true, message: "Parabéns! Você agora é um membro SOSTREAM Premium." });
        } catch (err) {
            throw err;
        }
    }
};

// ==========================================
// 4. DEFINIÇÃO DE ROTAS (PIPELINE)
// ==========================================

// --- Rotas Públicas ---
app.post('/api/auth/register', AuthController.register);
app.post('/api/auth/login', AuthController.login);
app.get('/api/health', (req, res) => res.json({ status: "Operacional", timestamp: new Date() }));

// --- Rotas de Mídia (Públicas/Híbridas) ---
app.get('/api/discovery', MediaController.getDiscovery);
app.get('/api/media/:id', MediaController.getDetails);
app.get('/api/search', MediaController.search);

// --- Rotas Privadas (Requerem Token) ---
app.get('/api/profile', authenticateToken, ProfileController.getProfile);
app.post('/api/profile/upgrade', authenticateToken, ProfileController.upgradeToPremium);

app.get('/api/favorites', authenticateToken, UserFeatureController.getFavorites);
app.post('/api/favorites/toggle', authenticateToken, UserFeatureController.toggleFavorite);

app.get('/api/history/continue', authenticateToken, UserFeatureController.getContinueWatching);
app.post('/api/history/update', authenticateToken, UserFeatureController.updateProgress);

// --- Rota de Simulação de Streaming (Proteção de Premium) ---
app.get('/api/stream/:episodeId', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { episodeId } = req.params;

        // Verificar se o episódio é free ou se o usuário é premium
        const content = await pool.query(`
            SELECT e.is_free, u.is_premium, e.video_url
            FROM episodes e, users u
            WHERE e.id = $1 AND u.id = $2
        `, [episodeId, userId]);

        if (content.rows.length === 0) return res.status(404).json({ error: "Episódio não encontrado." });

        const { is_free, is_premium, video_url } = content.rows[0];

        if (!is_free && !is_premium) {
            return res.status(403).json({
                error: "CONTEÚDO BLOQUEADO",
                message: "Este episódio requer uma assinatura Sostream Premium.",
                paywall: true
            });
        }

        res.json({ url: video_url, message: "Acesso autorizado." });
    } catch (err) {
        res.status(500).json({ error: "Erro ao validar acesso ao streaming." });
    }
});

// ==========================================
// 5. INICIALIZAÇÃO E TRATAMENTO DE ERROS
// ==========================================

// Catch-all para rotas inexistentes
app.use((req, res) => {
    res.status(404).json({ error: "Rota não encontrada no servidor Sostream." });
});

// Middleware de Erro Global
app.use(errorHandler);

// Iniciar Servidor
app.listen(PORT, () => {
    console.log(`
    ================================================
    🚀 SOSTREAM SERVER - ATIVO
    📡 PORTA: ${PORT}
    🌍 MODO: ${process.env.NODE_ENV}
    🛡️ SEGURANÇA: JWT + HELMET ATIVADOS
    ================================================
    `);
});

/**
 * NOTA PARA O ENGENHEIRO FRONT-END:
 * As rotas /api/discovery e /api/media/:id são otimizadas para
 * minimizar o número de requests (Waterfall) no Flutter.
 * Elas retornam objetos complexos contendo metadados e listas em um único hit.
 */