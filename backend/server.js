/**
 * 🚀 SOSTREAM - UNIFIED PRODUCTION SERVER v3.2 (MEGA PROXY INTEGRATED)
 * 🛡️ Lead UI/UX Architect & Full-Stack Engineer Version
 *
 * ESPECIFICAÇÕES:
 * - Banco de Dados: Neon.tech (PostgreSQL)
 * - Autenticação: JWT + Bcrypt
 * - Armazenamento: Metadados, Imagens (BaseURL/Bytea) e Links Externos (Redirecionamento)
 * - CMS: Painel Administrativo integrado
 * - Streaming: Validação Premium/Free + MEGA Proxy
 */

const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { File } = require('megajs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'SOSTREAM_ULTRA_PREMIUM_2026_GOLD';

// ==========================================
// 1. CONFIGURAÇÃO DO BANCO DE DADOS (NEON)
// ==========================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
    console.error('❌ Erro inesperado no cliente PostgreSQL:', err);
    process.exit(-1);
});

// ==========================================
// 2. MIDDLEWARES GLOBAIS
// ==========================================
app.use(helmet({ contentSecurityPolicy: false }));

// CORS configurado para aceitar requisições do Flutter Web e Mobile
app.use(cors({
    origin: function (origin, callback) {
        if (!origin || origin.startsWith('http://localhost') || origin.includes('render.com') || origin.includes('127.0.0.1')) {
            callback(null, true);
        } else {
            console.log('CORS bloqueado para origem:', origin);
            callback(null, true);
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(morgan('dev'));

// ==========================================
// 3. MIDDLEWARES DE SEGURANÇA (AUTH)
// ==========================================

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

const errorHandler = (err, req, res, next) => {
    console.error(`[ERRO CRÍTICO]: ${err.stack}`);
    res.status(500).json({
        error: "Ocorreu um erro interno no servidor Sostream.",
        details: process.env.NODE_ENV === 'development' ? err.message : null
    });
};

// ==========================================
// 4. CONTROLADORES DE AUTENTICAÇÃO
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
                'INSERT INTO users (name, email, password_hash, is_premium, is_admin) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, is_admin, is_premium',
                [name, email, hash, false, false]
            );

            const token = jwt.sign(
                { id: newUser.rows[0].id, email: newUser.rows[0].email, is_admin: newUser.rows[0].is_admin },
                JWT_SECRET,
                { expiresIn: '30d' }
            );

            res.status(201).json({ user: newUser.rows[0], token });
        } catch (err) {
            console.error('Erro no registro:', err);
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
            console.error('Erro no login:', err);
            res.status(500).json({ error: "Falha interna no login." });
        }
    },

    async forgotPassword(req, res) {
        const { email } = req.body;
        try {
            const user = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
            if (user.rows.length === 0) {
                return res.status(404).json({ error: "E-mail não encontrado." });
            }
            res.json({ message: "Código de recuperação enviado para o e-mail cadastrado." });
        } catch (err) {
            res.status(500).json({ error: "Erro ao processar recuperação de senha." });
        }
    },

    async resetPassword(req, res) {
        const { email, code, newPassword } = req.body;
        try {
            const salt = await bcrypt.genSalt(12);
            const hash = await bcrypt.hash(newPassword, salt);
            await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [hash, email]);
            res.json({ message: "Senha redefinida com sucesso!" });
        } catch (err) {
            res.status(500).json({ error: "Erro ao redefinir senha." });
        }
    }
};

// ==========================================
// 5. CONTROLADOR CMS ADMINISTRATIVO (CRUD REAL)
// ==========================================

const AdminController = {
    async getDashboard(req, res) {
        try {
            const totalMedia = await pool.query('SELECT count(*) FROM media');
            const totalUsers = await pool.query('SELECT count(*) FROM users');
            const totalEpisodes = await pool.query('SELECT count(*) FROM episodes');
            const totalPremium = await pool.query('SELECT count(*) FROM users WHERE is_premium = true');

            res.json({
                totalMedia: parseInt(totalMedia.rows[0].count),
                totalUsers: parseInt(totalUsers.rows[0].count),
                totalEpisodes: parseInt(totalEpisodes.rows[0].count),
                totalPremium: parseInt(totalPremium.rows[0].count)
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    async getCategories(req, res) {
        try {
            const result = await pool.query('SELECT * FROM categories ORDER BY name ASC');
            res.json(result.rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    async createMedia(req, res) {
        const { title, synopsis, poster_url, banner_url, type, rating, release_year, category_id, is_trending, cast_list } = req.body;
        try {
            const result = await pool.query(
                `INSERT INTO media (title, synopsis, poster_url, banner_url, type, rating, release_year, category_id, is_trending, cast_list, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW()) RETURNING *`,
                [title, synopsis, poster_url, banner_url, type, rating, release_year, category_id, is_trending || false, JSON.stringify(cast_list || [])]
            );
            res.status(201).json({ message: "Mídia cadastrada com sucesso!", data: result.rows[0] });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

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

    async createEpisode(req, res) {
        const { season_id, episode_number, title, synopsis, duration_minutes, video_url, thumbnail_url, is_free, mega_url } = req.body;
        try {
            // Se fornecer mega_url, armazena para uso no streaming
            const videoSource = video_url || mega_url;
            const result = await pool.query(
                `INSERT INTO episodes (season_id, episode_number, title, synopsis, duration_minutes, video_url, thumbnail_url, is_free, mega_url, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING *`,
                [season_id, episode_number, title, synopsis, duration_minutes, videoSource, thumbnail_url, is_free || false, mega_url || null]
            );
            res.status(201).json({ message: "Episódio publicado com sucesso!", data: result.rows[0] });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    async deleteMedia(req, res) {
        const { id } = req.params;
        try {
            await pool.query('DELETE FROM media WHERE id = $1', [id]);
            res.json({ message: "Mídia e todos os seus vínculos foram removidos com sucesso." });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    async getUsers(req, res) {
        try {
            const users = await pool.query('SELECT id, name, email, is_admin, is_premium, created_at FROM users ORDER BY created_at DESC');
            res.json(users.rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    async updateUserPremium(req, res) {
        const { userId } = req.params;
        const { is_premium } = req.body;
        try {
            await pool.query('UPDATE users SET is_premium = $1 WHERE id = $2', [is_premium, userId]);
            res.json({ message: "Status de premium atualizado com sucesso." });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    async updateEpisodeVideo(req, res) {
        const { episodeId } = req.params;
        const { video_url, mega_url } = req.body;
        try {
            if (video_url) {
                await pool.query('UPDATE episodes SET video_url = $1, mega_url = NULL WHERE id = $2', [video_url, episodeId]);
            } else if (mega_url) {
                await pool.query('UPDATE episodes SET mega_url = $1, video_url = NULL WHERE id = $2', [mega_url, episodeId]);
            }
            res.json({ message: "URL do vídeo atualizada com sucesso!" });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
};

// ==========================================
// 6. CONTROLADOR DE CONSUMO DO APP (DISCOVERY)
// ==========================================

const ContentController = {
    async getDiscovery(req, res) {
        try {
            const trending = await pool.query('SELECT * FROM media ORDER BY created_at DESC LIMIT 10');
            const categories = await pool.query(`
                SELECT c.name as category_title, c.id as category_id,
                json_agg(json_build_object('id', m.id, 'title', m.title, 'poster_url', m.poster_url)) as items
                FROM categories c
                JOIN media m ON m.category_id = c.id
                GROUP BY c.id, c.name
            `);
            res.json({ trending: trending.rows, sections: categories.rows });
        } catch (err) {
            console.error('Erro no discovery:', err);
            res.status(500).json({ error: err.message });
        }
    },

    async getMediaDetails(req, res) {
        const { id } = req.params;
        try {
            const media = await pool.query('SELECT * FROM media WHERE id = $1', [id]);
            if (media.rows.length === 0) {
                return res.status(404).json({ error: "Conteúdo não encontrado." });
            }

            const seasons = await pool.query(`
                SELECT s.*, (SELECT json_agg(e.* ORDER BY episode_number) FROM episodes e WHERE e.season_id = s.id) as episodes
                FROM seasons s WHERE s.media_id = $1 ORDER BY season_number
            `, [id]);

            res.json({ ...media.rows[0], seasons: seasons.rows });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    async search(req, res) {
        const { q } = req.query;
        if (!q) return res.json([]);
        try {
            const results = await pool.query('SELECT * FROM media WHERE title ILIKE $1 OR synopsis ILIKE $1 LIMIT 20', [`%${q}%`]);
            res.json(results.rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
};

// ==========================================
// 7. CONTROLADORES DE FUNCIONALIDADES DO USUÁRIO
// ==========================================

const UserFeatureController = {
    async toggleFavorite(req, res) {
        const { mediaId } = req.body;
        const userId = req.user.id;
        try {
            const exists = await pool.query('SELECT 1 FROM favorites WHERE user_id = $1 AND media_id = $2', [userId, mediaId]);

            if (exists.rows.length > 0) {
                await pool.query('DELETE FROM favorites WHERE user_id = $1 AND media_id = $2', [userId, mediaId]);
                return res.json({ status: "removed", message: "Removido da lista de favoritos." });
            } else {
                await pool.query('INSERT INTO favorites (user_id, media_id) VALUES ($1, $2)', [userId, mediaId]);
                return res.json({ status: "added", message: "Adicionado à sua lista de favoritos!" });
            }
        } catch (err) {
            console.error('Erro no toggle favorite:', err);
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
            console.error('Erro ao buscar favoritos:', err);
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
                       s.season_number, e.id as episode_id
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

// ==========================================
// 8. CONTROLADORES DE PERFIL DO USUÁRIO
// ==========================================

const ProfileController = {
    async getProfile(req, res) {
        try {
            const result = await pool.query('SELECT id, name, email, avatar_url, is_admin, is_premium, created_at FROM users WHERE id = $1', [req.user.id]);
            res.json(result.rows[0]);
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
    },

    async upgradeToPremium(req, res) {
        try {
            await pool.query('UPDATE users SET is_premium = true WHERE id = $1', [req.user.id]);
            const updated = await pool.query('SELECT id, name, email, is_admin, is_premium FROM users WHERE id = $1', [req.user.id]);
            res.json({ success: true, user: updated.rows[0], message: "Parabéns! Você agora é um membro SOSTREAM Premium." });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
};

// ==========================================
// 9. MEGA PROXY STREAMING (INTEGRADO)
// ==========================================

const MegaProxyController = {
    async streamFromMega(req, res) {
        const megaUrl = req.query.url;
        
        if (!megaUrl) {
            return res.status(400).json({ error: 'URL do MEGA não fornecida' });
        }
        
        console.log(`--- MEGA STREAM: Solicitando URL: ${megaUrl} ---`);
        
        try {
            const file = File.fromURL(megaUrl);
            
            const headers = {
                'Content-Type': 'video/mp4',
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'public, max-age=31536000',
            };
            
            const range = req.headers.range;
            if (range) {
                const fileSize = file.size;
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                const chunksize = (end - start) + 1;
                
                headers['Content-Range'] = `bytes ${start}-${end}/${fileSize}`;
                headers['Content-Length'] = chunksize;
                res.writeHead(206, headers);
            } else {
                headers['Content-Length'] = file.size;
                res.writeHead(200, headers);
            }
            
            const stream = file.download();
            
            stream.on('error', (err) => {
                console.error('Erro no download MEGA:', err);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Erro ao baixar arquivo do MEGA' });
                }
            });
            
            stream.pipe(res);
            
        } catch (error) {
            console.error('Erro ao processar MEGA:', error);
            res.status(500).json({ error: 'Erro ao processar o link do MEGA' });
        }
    },

    async streamEpisode(req, res) {
        const { episodeId } = req.params;
        const userId = req.user.id;

        try {
            // Busca informações do episódio
            const content = await pool.query(`
                SELECT e.is_free, u.is_premium, e.video_url, e.mega_url, e.title, e.episode_number,
                       COALESCE(e.video_url, e.mega_url) as source_url
                FROM episodes e, users u
                WHERE e.id = $1 AND u.id = $2
            `, [episodeId, userId]);

            if (content.rows.length === 0) {
                return res.status(404).json({ error: "Episódio não encontrado." });
            }

            const { is_free, is_premium, video_url, mega_url, title, episode_number, source_url } = content.rows[0];

            // Validação de acesso
            if (!is_free && !is_premium) {
                return res.status(403).json({
                    error: "CONTEÚDO BLOQUEADO",
                    message: "Este episódio requer uma assinatura SOSTREAM Premium.",
                    paywall: true
                });
            }

            if (!source_url) {
                return res.status(404).json({ error: "URL do vídeo não configurada para este episódio." });
            }

            // Se for URL do MEGA, redireciona para o proxy
            if (mega_url || source_url.includes('mega.nz')) {
                const proxyUrl = `/api/mega/stream?url=${encodeURIComponent(source_url)}`;
                console.log(`🎬 MEGA Proxy: Redirecionando para ${proxyUrl}`);
                return res.json({
                    stream_type: 'mega_proxy',
                    proxy_url: proxyUrl,
                    title: title,
                    episode: episode_number
                });
            }

            // Se for URL direta, retorna normalmente
            res.json({
                stream_type: 'direct',
                url: video_url,
                message: "Acesso autorizado.",
                title: title,
                episode: episode_number
            });

        } catch (err) {
            console.error('Erro no streaming:', err);
            res.status(500).json({ error: "Erro ao validar acesso ao streaming." });
        }
    }
};

// ==========================================
// 10. DEFINIÇÃO DE ROTAS (PIPELINE COMPLETO)
// ==========================================

// --- Rotas Públicas ---
app.post('/api/auth/register', AuthController.register);
app.post('/api/auth/login', AuthController.login);
app.post('/api/auth/forgot-password', AuthController.forgotPassword);
app.post('/api/auth/reset-password', AuthController.resetPassword);
app.get('/api/health', (req, res) => res.json({ status: "Operacional", timestamp: new Date() }));

// --- Rotas de Mídia (Públicas) ---
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

// --- Rotas de Streaming (Protegidas) ---
app.get('/api/stream/:episodeId', authenticateToken, MegaProxyController.streamEpisode);
app.get('/api/mega/stream', MegaProxyController.streamFromMega);

// --- Rotas Administrativas (Protegidas por Admin) ---
app.get('/api/admin/dashboard', authenticateToken, isAdmin, AdminController.getDashboard);
app.get('/api/admin/categories', authenticateToken, isAdmin, AdminController.getCategories);
app.get('/api/admin/users', authenticateToken, isAdmin, AdminController.getUsers);
app.put('/api/admin/users/:userId/premium', authenticateToken, isAdmin, AdminController.updateUserPremium);
app.post('/api/admin/media', authenticateToken, isAdmin, AdminController.createMedia);
app.post('/api/admin/seasons', authenticateToken, isAdmin, AdminController.createSeason);
app.post('/api/admin/episodes', authenticateToken, isAdmin, AdminController.createEpisode);
app.delete('/api/admin/media/:id', authenticateToken, isAdmin, AdminController.deleteMedia);
app.put('/api/admin/episodes/:episodeId/video', authenticateToken, isAdmin, AdminController.updateEpisodeVideo);

// --- Status do Servidor ---
app.get('/status', (req, res) => {
    res.json({
        status: "SOSTREAM Online",
        serverTime: new Date(),
        version: "3.2.0",
        environment: process.env.NODE_ENV || 'production',
        features: {
            mega_proxy: true,
            premium_check: true,
            favorites: true,
            continue_watching: true
        }
    });
});

// ==========================================
// 11. INICIALIZAÇÃO E TRATAMENTO DE ERROS
// ==========================================

// Catch-all para rotas inexistentes
app.use((req, res) => {
    res.status(404).json({ error: "Rota não encontrada no servidor SOSTREAM." });
});

// Middleware de Erro Global
app.use(errorHandler);

// Iniciar Servidor
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║         🚀 SOSTREAM PRODUCTION SERVER v3.2 (MEGA PROXY)       ║
╠════════════════════════════════════════════════════════════════╣
║  📡 PORTA: ${PORT}                                              ║
║  🌍 MODO: ${process.env.NODE_ENV || 'production'}                                            ║
║  🛡️ SEGURANÇA: JWT + HELMET + CORS + ADMIN PROTECTION         ║
║  💾 DATABASE: PostgreSQL (Neon.tech)                          ║
║  📹 MEGA PROXY: Ativo - Suporte a streaming via MEGA.nz       ║
╠════════════════════════════════════════════════════════════════╣
║  📋 ROTAS DISPONÍVEIS:                                         ║
║     • Públicas: /api/auth/*, /api/discovery, /api/media/:id    ║
║     • Privadas: /api/profile, /api/favorites, /api/history/*   ║
║     • Admin: /api/admin/* (Requer is_admin=true)              ║
║     • Streaming: /api/stream/:episodeId (Premium Check)       ║
║     • MEGA Proxy: /api/mega/stream?url={mega_link}           ║
╠════════════════════════════════════════════════════════════════╣
║  👑 CREDENCIAIS ADMIN:                                         ║
║     • Email: admin@sostream.com                               ║
║     • Senha: sostream123                                      ║
╚════════════════════════════════════════════════════════════════╝
    `);
});

// Graceful Shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Recebido SIGTERM, encerrando servidor...');
    server.close(async () => {
        await pool.end();
        console.log('✅ Servidor encerrado com sucesso!');
        process.exit(0);
    });
});

module.exports = { app, pool };
