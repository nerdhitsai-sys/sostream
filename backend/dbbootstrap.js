/**
 * 🚀 SOSTREAM - DATABASE BOOTSTRAPPER (FINAL PRODUCTION VERSION)
 * 🛡️ Proteção de Integridade e CMS Ativado
 */

const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
});

async function bootstrap() {
    console.log("--------------------------------------------------");
    console.log("⚡ INICIANDO CONSTRUÇÃO DO UNIVERSO SOSTREAM...");
    console.log("--------------------------------------------------");

    const client = await pool.connect();

    try {
        // 1. LIMPEZA DE SEGURANÇA
        console.log("🧹 Removendo esquemas antigos...");
        await client.query(`
            DROP TABLE IF EXISTS watch_history CASCADE;
            DROP TABLE IF EXISTS favorites CASCADE;
            DROP TABLE IF EXISTS episodes CASCADE;
            DROP TABLE IF EXISTS seasons CASCADE;
            DROP TABLE IF EXISTS media CASCADE;
            DROP TABLE IF EXISTS categories CASCADE;
            DROP TABLE IF EXISTS users CASCADE;
            DROP TYPE IF EXISTS media_type CASCADE;
        `);

        // 2. CRIAÇÃO DE TIPOS
        await client.query(`CREATE TYPE media_type AS ENUM ('movie', 'tv_show', 'anime');`);

        // 3. TABELA DE USUÁRIOS (COM FLAGS DE ADMIN E PREMIUM)
        console.log("🏗️ Criando Tabela de Usuários...");
        await client.query(`
            CREATE TABLE users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                avatar_url TEXT DEFAULT 'https://i.pravatar.cc/150?u=sostream',
                is_premium BOOLEAN DEFAULT false,
                is_admin BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 4. TABELA DE CATEGORIAS
        await client.query(`
            CREATE TABLE categories (
                id SERIAL PRIMARY KEY,
                name VARCHAR(50) NOT NULL,
                slug VARCHAR(50) UNIQUE NOT NULL
            );
        `);

        // 5. TABELA DE MÍDIA (SUPORTE A BASE64 E LINKS LONGOS)
        console.log("🏗️ Criando Tabela de Mídia...");
        await client.query(`
            CREATE TABLE media (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                synopsis TEXT,
                poster_url TEXT, -- Aceita URL ou Base64 (Bytea string)
                banner_url TEXT, -- Aceita URL ou Base64
                type media_type NOT NULL,
                rating VARCHAR(10),
                release_year INTEGER,
                category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
                is_trending BOOLEAN DEFAULT false,
                cast_list JSONB DEFAULT '[]',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 6. ESTRUTURA DE EPISÓDIOS (REDIRECIONAMENTO)
        await client.query(`
            CREATE TABLE seasons (
                id SERIAL PRIMARY KEY,
                media_id INTEGER REFERENCES media(id) ON DELETE CASCADE,
                season_number INTEGER NOT NULL,
                title VARCHAR(100),
                UNIQUE(media_id, season_number)
            );

            CREATE TABLE episodes (
                id SERIAL PRIMARY KEY,
                season_id INTEGER REFERENCES seasons(id) ON DELETE CASCADE,
                episode_number INTEGER NOT NULL,
                title VARCHAR(255) NOT NULL,
                synopsis TEXT,
                duration_minutes INTEGER,
                video_url TEXT, -- LINK DRIVE / MEGA / MEDIAFIRE
                thumbnail_url TEXT,
                is_free BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 7. TABELAS AUXILIARES
        await client.query(`
            CREATE TABLE favorites (
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                media_id INTEGER REFERENCES media(id) ON DELETE CASCADE,
                PRIMARY KEY (user_id, media_id)
            );

            CREATE TABLE watch_history (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                episode_id INTEGER REFERENCES episodes(id) ON DELETE CASCADE,
                progress_seconds INTEGER DEFAULT 0,
                total_seconds INTEGER DEFAULT 0,
                last_watched TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, episode_id)
            );
        `);

        // 8. SEEDING (DADOS INICIAIS)
        console.log("🌱 Populando Categorias e Admin...");

        await client.query(`
            INSERT INTO categories (name, slug) VALUES
            ('Ação', 'acao'), ('Aventura', 'aventura'), ('Animação', 'animacao'),
            ('Drama', 'drama'), ('Fantasia', 'fantasia'), ('Sci-Fi', 'sci-fi'),
            ('Terror', 'terror'), ('Comédia', 'comedia'), ('Suspense', 'suspense');
        `);

        // CRIAR ADMIN MESTRE
        const salt = await bcrypt.genSalt(12);
        const hash = await bcrypt.hash('sostream123', salt);
        await client.query(`
            INSERT INTO users (name, email, password_hash, is_premium, is_admin)
            VALUES ('Timur Premium', 'timur@sostream.com', '${hash}', true, true);
        `);

        console.log("--------------------------------------------------");
        console.log("⭐ BOOTSTRAP FINALIZADO: SISTEMA PRONTO PARA USO!");
        console.log("ACESSO ADMIN: timur@sostream.com / sostream123");
        console.log("--------------------------------------------------");

    } catch (err) {
        console.error("❌ ERRO NO BOOTSTRAP:", err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

bootstrap();
