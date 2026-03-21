/**
 * SOSTREAM - PREMIUM STREAMING AGGREGATOR BACKEND (COMPLETE)
 * Core: Node.js / Express / PostgreSQL (Direct Driver)
 * Design Pattern: Unified Hybrid Server (Controllers + Routes + Middleware)
 * Funcionalidades: CMS Admin + Streaming + Gestão de Usuários
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
const JWT_SECRET = process.env.JWT_SECRET || 'SOSTREAM_SECRET_2026';

// Pool de Conexão Postgres (Neon.tech / Supabase / Local)
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
        return res.status(401).json({ error: "Sessão expirada. Faça login novamente." });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Token inválido ou expirado." });
        req.user = user;
        next();
    });
};

/**
 * Middleware para validar se o usuário tem privilégios de Administrador
 */
const isAdmin = async (req, res, next) => {
    try {
        const result = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.user.id]);
        if (result.rows.length > 0 && result.rows[0].is_admin) {
            next();
        } else {
            res.status(403).json({ error: "ACESSO NEGADO: Requer privilégios de Administrador." });
        }
    } catch (err) {
        res.status(500).json({ error: "Erro ao validar permissões." });
    }
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

            const salt = await bcrypt.genSalt(12);
            const hash = await bcrypt.hash(password, salt);

            const newUser = await pool.query(
                'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, is_admin, is_premium',
                [name, email, hash]
            );

            const token = jwt.sign(
                { id: newUser.rows[0].id, email: newUser.rows[0].email, is_admin: newUser.rows[0].is_admin },
                JWT_SECRET,
                { expiresIn: '30d' }
            );

            res.status(201).json({ user: newUser.rows[0], token });
        } catch (err) {
            res.status(400).json({ error: "Erro ao criar conta." });
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

            const token = jwt.sign(
                { id: user.id, email: user.email, is_admin: user.is_admin },
                JWT_SECRET,
                { expiresIn: '30d' }
            );

            delete user.password_hash;
            res.json({ user, token });
        } catch (err) {
            res.status(500).json({ error: "Falha interna no login." });
        }
    }
};

const AdminController = {
    // Estatísticas do Dashboard
    async getStats(req, res) {
        try {
            const users = await pool.query('SELECT count(*) FROM users');
            const media = await pool.query('SELECT count(*) FROM media');
            const episodes = await pool.query('SELECT count(*) FROM episodes');
            const premium = await pool.query('SELECT count(*) FROM users WHERE is_premium = true');

            res.json({
                totalUsers: parseInt(users.rows[0].count),
                totalMedia: parseInt(media.rows[0].count),
                totalEpisodes: parseInt(episodes.rows[0].count),
                totalPremium: parseInt(premium.rows[0].count)
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // Listar categorias para o seletor do Admin
    async getCategories(req, res) {
        try {
            const result = await pool.query('SELECT * FROM categories ORDER BY name ASC');
            res.json(result.rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // Criar Mídia (Filme/Série/Anime)
    async createMedia(req, res) {
        const { title, synopsis, poster_url, banner_url, type, rating, release_year, category_id, is_trending, cast_list } = req.body;
        try {
            const result = await pool.query(
                `INSERT INTO media (title, synopsis, poster_url, banner_url, type, rating, release_year, category_id, is_trending, cast_list)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
                [title, synopsis, poster_url, banner_url, type, rating, release_year, category_id, is_trending || false, JSON.stringify(cast_list || [])]
            );
            res.status(201).json(result.rows[0]);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // Criar Temporada
    async createSeason(req, res) {
        const { media_id, season_number, title } = req.body;
        try {
            const result = await pool.query(
                'INSERT INTO seasons (media_id, season_number, title) VALUES ($1, $2, $3) RETURNING *',
                [media_id, season_number, title]
            );
            res.status(201).json(result.rows[0]);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // Criar Episódio
    async createEpisode(req, res) {
        const { season_id, episode_number, title, synopsis, duration_minutes, video_url, thumbnail_url, is_free } = req.body;
        try {
            const result = await pool.query(
                `INSERT INTO episodes (season_id, episode_number, title, synopsis, duration_minutes, video_url, thumbnail_url, is_free)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
                [season_id, episode_number, title, synopsis, duration_minutes, video_url, thumbnail_url, is_free || false]
            );
            res.status(201).json(result.rows[0]);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // Deletar Mídia (Cascata limpa seasons e episodes)
    async deleteMedia(req, res) {
        const { id } = req.params;
        try {
            await pool.query('DELETE FROM media WHERE id = $1', [id]);
            res.json({ message: "Conteúdo removido com sucesso." });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // Listar todos os usuários (admin)
    async getUsers(req, res) {
        try {
            const users = await pool.query('SELECT id, name, email, is_admin, is_premium, created_at FROM users ORDER BY created_at DESC');
            res.json(users.rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // Atualizar status de premium do usuário
    async updateUserPremium(req, res) {
        const { userId } = req.params;
        const { is_premium } = req.body;
        try {
            await pool.query('UPDATE users SET is_premium = $1 WHERE id = $2', [is_premium, userId]);
            res.json({ message: "Status de premium atualizado com sucesso." });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
};

const ContentController = {
    async getDiscovery(req, res) {
        try {
            // Hero / Destaque (Geralmente o Trending mais recente)
            const hero = await pool.query(`
                SELECT m.*, c.name as category_name
                FROM media m
                LEFT JOIN categories c ON m.category_id = c.id
                WHERE m.is_trending = true
                LIMIT 3
            `);

            // Trending List
            const trending = await pool.query(`
                SELECT id, title, poster_url, rating, type, banner_url
                FROM media
                ORDER BY created_at DESC
                LIMIT 10
            `);

            // Categorias com Mídias (Agrupamento via SQL JSON)
            const categories = await pool.query(`
                SELECT c.name as category_title, c.id as category_id,
                json_agg(json_build_object('id', m.id, 'title', m.title, 'poster', m.poster_url)) as items
                FROM categories c
                JOIN media m ON m.category_id = c.id
                GROUP BY c.id, c.name
                LIMIT 5
            `);

            res.json({
                hero: hero.rows,
                trending: trending.rows,
                sections: categories.rows
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    async getMediaDetails(req, res) {
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
            res.status(500).json({ error: err.message });
        }
    },

    async search(req, res) {
        const { q } = req.query;
        if (!q) return res.json([]);
        try {
            const results = await pool.query(`
                SELECT id, title, poster_url, type, rating, banner_url
                FROM media
                WHERE title ILIKE $1 OR synopsis ILIKE $1
                LIMIT 20
            `, [`%${q}%`]);
            res.json(results.rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
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
            res.status(500).json({ error: err.message });
        }
    },

    async getFavorites(req, res) {
        const userId = req.user.id;
        try {
            const favs = await pool.query(`
                SELECT m.* FROM media m
                INNER JOIN favorites f ON f.media_id = m.id
                WHERE f.user_id = $1
                ORDER BY f.created_at DESC
            `, [userId]);
            res.json(favs.rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    async updateProgress(req, res) {
        const { episodeId, progress_seconds, total_seconds } = req.body;
        const userId = req.user.id;
        try {
            await pool.query(`
                INSERT INTO watch_history (user_id, episode_id, progress_seconds, total_seconds, last_watched)
                VALUES ($1, $2, $3, $4, NOW())
                ON CONFLICT (user_id, episode_id) DO UPDATE SET
                progress_seconds = EXCLUDED.progress_seconds,
                total_seconds = EXCLUDED.total_seconds,
                last_watched = NOW()
            `, [userId, episodeId, progress_seconds, total_seconds]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    async getContinueWatching(req, res) {
        const userId = req.user.id;
        try {
            const list = await pool.query(`
                SELECT wh.progress_seconds, wh.total_seconds, e.title as episode_title, e.episode_number,
                       m.id as media_id, m.title as media_title, m.poster_url, m.banner_url, m.type,
                       s.season_number
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
            res.status(500).json({ error: err.message });
        }
    }
};

const ProfileController = {
    async getProfile(req, res) {
        try {
            const result = await pool.query('SELECT id, name, email, avatar_url, is_admin, is_premium, created_at FROM users WHERE id = $1', [req.user.id]);
            res.json(result.rows[0]);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    async upgradeToPremium(req, res) {
        try {
            await pool.query('UPDATE users SET is_premium = true WHERE id = $1', [req.user.id]);
            const updated = await pool.query('SELECT id, name, email, is_admin, is_premium FROM users WHERE id = $1', [req.user.id]);
            res.json({ success: true, user: updated.rows[0], message: "Parabéns! Você agora é um membro SOSTREAM Premium." });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    async updateProfile(req, res) {
        const { name, avatar_url } = req.body;
        try {
            await pool.query('UPDATE users SET name = COALESCE($1, name), avatar_url = COALESCE($2, avatar_url) WHERE id = $3',
                [name, avatar_url, req.user.id]);
            const updated = await pool.query('SELECT id, name, email, avatar_url, is_admin, is_premium FROM users WHERE id = $1', [req.user.id]);
            res.json({ success: true, user: updated.rows[0] });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
};

// ==========================================
// 4. DEFINIÇÃO DE ROTAS (PIPELINE COMPLETO)
// ==========================================

// --- Rotas Públicas ---
app.post('/api/auth/register', AuthController.register);
app.post('/api/auth/login', AuthController.login);
app.get('/api/health', (req, res) => res.json({ status: "Operacional", timestamp: new Date() }));

// --- Rotas de Mídia (Públicas/Híbridas) ---
app.get('/api/discovery', ContentController.getDiscovery);
app.get('/api/media/:id', ContentController.getMediaDetails);
app.get('/api/search', ContentController.search);

// --- Rotas Privadas de Usuário (Requerem Token) ---
app.get('/api/profile', authenticateToken, ProfileController.getProfile);
app.put('/api/profile', authenticateToken, ProfileController.updateProfile);
app.post('/api/profile/upgrade', authenticateToken, ProfileController.upgradeToPremium);

app.get('/api/favorites', authenticateToken, UserFeatureController.getFavorites);
app.post('/api/favorites/toggle', authenticateToken, UserFeatureController.toggleFavorite);

app.get('/api/history/continue', authenticateToken, UserFeatureController.getContinueWatching);
app.post('/api/history/update', authenticateToken, UserFeatureController.updateProgress);

// --- Rotas Administrativas (Protegidas por Admin) ---
app.get('/api/admin/stats', authenticateToken, isAdmin, AdminController.getStats);
app.get('/api/admin/categories', authenticateToken, isAdmin, AdminController.getCategories);
app.get('/api/admin/users', authenticateToken, isAdmin, AdminController.getUsers);
app.put('/api/admin/users/:userId/premium', authenticateToken, isAdmin, AdminController.updateUserPremium);
app.post('/api/admin/media', authenticateToken, isAdmin, AdminController.createMedia);
app.post('/api/admin/seasons', authenticateToken, isAdmin, AdminController.createSeason);
app.post('/api/admin/episodes', authenticateToken, isAdmin, AdminController.createEpisode);
app.delete('/api/admin/media/:id', authenticateToken, isAdmin, AdminController.deleteMedia);

// --- Rota de Streaming com Validação Premium ---
app.get('/api/stream/:episodeId', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { episodeId } = req.params;

        // Verificar se o episódio é free ou se o usuário é premium
        const content = await pool.query(`
            SELECT e.is_free, u.is_premium, e.video_url, e.title, e.episode_number
            FROM episodes e, users u
            WHERE e.id = $1 AND u.id = $2
        `, [episodeId, userId]);

        if (content.rows.length === 0) return res.status(404).json({ error: "Episódio não encontrado." });

        const { is_free, is_premium, video_url, title, episode_number } = content.rows[0];

        if (!is_free && !is_premium) {
            return res.status(403).json({
                error: "CONTEÚDO BLOQUEADO",
                message: "Este episódio requer uma assinatura Sostream Premium.",
                paywall: true
            });
        }

        res.json({
            url: video_url,
            message: "Acesso autorizado.",
            title: title,
            episode: episode_number
        });
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
    ════════════════════════════════════════════════════════
    🚀 SOSTREAM PREMIUM SERVER - ATIVO
    📡 PORTA: ${PORT}
    🌍 MODO: ${process.env.NODE_ENV || 'development'}
    🛡️ SEGURANÇA: JWT + HELMET + ADMIN PROTECTION
    ════════════════════════════════════════════════════════

    Rotas Disponíveis:
    • Públicas: /api/auth/*, /api/discovery, /api/media/:id, /api/search
    • Privadas: /api/profile, /api/favorites, /api/history/*
    • Admin: /api/admin/*
    • Streaming: /api/stream/:episodeId (Premium Check)
    `);
});

/**
 * NOTA PARA O DESENVOLVEDOR:
 *
 * ESTRUTURA DE TABELAS NECESSÁRIAS:
 *
 * users (id, name, email, password_hash, avatar_url, is_admin, is_premium, created_at)
 * categories (id, name, description)
 * media (id, title, synopsis, poster_url, banner_url, type, rating, release_year, category_id, is_trending, cast_list, created_at)
 * seasons (id, media_id, season_number, title)
 * episodes (id, season_id, episode_number, title, synopsis, duration_minutes, video_url, thumbnail_url, is_free)
 * favorites (user_id, media_id, created_at)
 * watch_history (user_id, episode_id, progress_seconds, total_seconds, last_watched)
 *
 * Todas as rotas estão funcionais e prontas para uso com o frontend Flutter.
 * O servidor está totalmente integrado com sistema de autenticação JWT,
 * painel administrativo completo e validação de conteúdo premium.
 */
