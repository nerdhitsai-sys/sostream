/**
 * SOSTREAM - DATABASE BOOTSTRAPPER (ULTRA ROBUST VERSION)
 * Arquitetura: PostgreSQL Direto (sem ORM)
 * Finalidade: Criação de Tabelas, Índices, Triggers e Inserção de Dados Reais
 */

const { Client } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

const client = new Client({
    connectionString: connectionString,
});

async function bootstrap() {
    try {
        console.log("--- INICIANDO BOOTSTRAP SOSTREAM ---");
        await client.connect();
        console.log("Conectado ao PostgreSQL Neon.tech com sucesso.");

        // 1. LIMPEZA TOTAL (OPCIONAL PARA DESENVOLVIMENTO)
        console.log("Limpando esquema anterior...");
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

        // 2. CRIAÇÃO DE TIPOS ENUM
        await client.query(`CREATE TYPE media_type AS ENUM ('movie', 'tv_show', 'anime');`);

        // 3. ESTRUTURA DE TABELAS (CLEAN ARCHITECTURE READY)
        console.log("Criando tabelas...");

        // TABELA DE USUÁRIOS
        await client.query(`
            CREATE TABLE users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                avatar_url TEXT DEFAULT 'https://i.pravatar.cc/150?u=sostream',
                is_premium BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // TABELA DE CATEGORIAS
        await client.query(`
            CREATE TABLE categories (
                id SERIAL PRIMARY KEY,
                name VARCHAR(50) NOT NULL,
                slug VARCHAR(50) UNIQUE NOT NULL
            );
        `);

        // TABELA DE MÍDIA (FILMES/SÉRIES)
        await client.query(`
            CREATE TABLE media (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                synopsis TEXT,
                poster_url TEXT,
                banner_url TEXT,
                type media_type NOT NULL,
                rating VARCHAR(10),
                release_year INTEGER,
                category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
                is_trending BOOLEAN DEFAULT false,
                cast_list JSONB DEFAULT '[]',
                average_rating DECIMAL(3,1) DEFAULT 0.0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // TABELA DE TEMPORADAS
        await client.query(`
            CREATE TABLE seasons (
                id SERIAL PRIMARY KEY,
                media_id INTEGER REFERENCES media(id) ON DELETE CASCADE,
                season_number INTEGER NOT NULL,
                title VARCHAR(100),
                UNIQUE(media_id, season_number)
            );
        `);

        // TABELA DE EPISÓDIOS
        await client.query(`
            CREATE TABLE episodes (
                id SERIAL PRIMARY KEY,
                season_id INTEGER REFERENCES seasons(id) ON DELETE CASCADE,
                episode_number INTEGER NOT NULL,
                title VARCHAR(255) NOT NULL,
                synopsis TEXT,
                duration_minutes INTEGER,
                video_url TEXT,
                thumbnail_url TEXT,
                is_free BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // TABELA DE FAVORITOS
        await client.query(`
            CREATE TABLE favorites (
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                media_id INTEGER REFERENCES media(id) ON DELETE CASCADE,
                PRIMARY KEY (user_id, media_id)
            );
        `);

        // TABELA DE HISTÓRICO (CONTINUE ASSISTINDO)
        await client.query(`
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

        // 4. CRIAÇÃO DE ÍNDICES PARA PERFORMANCE ULTRA-RÁPIDA
        console.log("Otimizando com índices...");
        await client.query(`CREATE INDEX idx_media_category ON media(category_id);`);
        await client.query(`CREATE INDEX idx_media_trending ON media(is_trending) WHERE is_trending = true;`);
        await client.query(`CREATE INDEX idx_episodes_season ON episodes(season_id);`);

        // 5. INSERÇÃO DE DADOS (SEEDING SELETO)
        console.log("Inserindo dados de semente (Seeding)...");

        // Categorias
        const catRes = await client.query(`
            INSERT INTO categories (name, slug) VALUES
            ('Ação', 'acao'), ('Fantasia', 'fantasia'), ('Drama', 'drama'),
            ('Ficção Científica', 'sci-fi'), ('Animação', 'animacao')
            RETURNING id, name;
        `);
        const catMap = {};
        catRes.rows.forEach(r => catMap[r.name] = r.id);

        // Mídia Principal: Arcane
        const arcaneRes = await client.query(`
            INSERT INTO media (title, synopsis, poster_url, banner_url, type, rating, release_year, category_id, is_trending, cast_list)
            VALUES (
                'Arcane',
                'Em meio ao conflito entre as cidades de Piltover e Zaun, duas irmãs lutam em lados opostos de uma guerra entre tecnologias mágicas e convicções incompatíveis.',
                'https://m.media-amazon.com/images/M/MV5BYmU1ZWY3NzMtMGY1MS00NjRlLWE2NDgtYzk5YTAzZWY2ZTVlXkEyXkFqcGdeQXVyMTEyMjM2NDc2._V1_FMjpg_UX1000_.jpg',
                'https://images.alphacoders.com/119/1190454.jpg',
                'tv_show', '16+', 2021, ${catMap['Animação']}, true,
                '[{"name": "Hailee Steinfeld", "role": "Vi"}, {"name": "Ella Purnell", "role": "Jinx"}]'
            ) RETURNING id;
        `);
        const arcaneId = arcaneRes.rows[0].id;

        // Temporada 1 de Arcane
        const s1Res = await client.query(`
            INSERT INTO seasons (media_id, season_number, title)
            VALUES (${arcaneId}, 1, 'Temporada 1') RETURNING id;
        `);
        const s1Id = s1Res.rows[0].id;

        // Episódios de Arcane (S01)
        await client.query(`
            INSERT INTO episodes (season_id, episode_number, title, synopsis, duration_minutes, video_url, thumbnail_url, is_free)
            VALUES
            (${s1Id}, 1, 'Welcome to the Playground', 'As irmãs órfãs Vi e Powder causam confusão nas ruas de Piltover.', 42, 'https://cdn.sostream.com/arcane/s1e1.mp4', 'https://images.alphacoders.com/119/1190454.jpg', true),
            (${s1Id}, 2, 'Some Mysteries Are Better Left Unsolved', 'Jayce testa uma tecnologia perigosa enquanto a tensão em Zaun aumenta.', 40, 'https://cdn.sostream.com/arcane/s1e2.mp4', 'https://images.alphacoders.com/119/1190454.jpg', false),
            (${s1Id}, 3, 'The Base Violence Necessary for Change', 'Um confronto épico muda o destino das irmãs para sempre.', 45, 'https://cdn.sostream.com/arcane/s1e3.mp4', 'https://images.alphacoders.com/119/1190454.jpg', false);
        `);

        // Outras Mídias para a Home (Trending)
        await client.query(`
            INSERT INTO media (title, synopsis, poster_url, banner_url, type, rating, release_year, category_id, is_trending)
            VALUES
            ('Joker', 'Arthur Fleck busca conexão enquanto caminha pelas ruas de Gotham.', 'https://m.media-amazon.com/images/M/MV5BNGVjNWI4ZGUtNzE0MS00YTJmLWE0ZDctN2ZiYTk2YmI3NTYyXkEyXkFqcGdeQXVyMTkxNjUyNQ@@._V1_.jpg', 'https://wallpapercave.com/wp/wp4675541.jpg', 'movie', '16+', 2019, ${catMap['Drama']}, true),
            ('Captain Marvel', 'Carol Danvers se torna uma das heroínas mais poderosas do universo.', 'https://m.media-amazon.com/images/M/MV5BMTE0YWFmOTMtMDllNC00ZTAxLThlOTEtYTgwOTgzOTUxODgyXkEyXkFqcGdeQXVyNzkwMjQ5NzM@._V1_.jpg', 'https://wallpaperaccess.com/full/733925.jpg', 'movie', '12+', 2019, ${catMap['Ação']}, true),
            ('The Hobbit', 'Bilbo Baggins embarca em uma jornada épica para resgatar um reino.', 'https://m.media-amazon.com/images/M/MV5BMTcwNTE4MTUxMl5BMl5BanBnXkFtZTcwMDIyODM4OA@@._V1_.jpg', 'https://wallpaperaccess.com/full/431119.jpg', 'movie', '12+', 2012, ${catMap['Fantasia']}, true);
        `);

        // Usuário de Teste (Timur K.)
        const bcrypt = require('bcrypt');
        const hash = await bcrypt.hash('sostream123', 12);
        await client.query(`
            INSERT INTO users (name, email, password_hash, is_premium, avatar_url)
            VALUES ('Timur K.', 'timur@sostream.com', '${hash}', true, 'https://i.pravatar.cc/150?u=timur');
        `);

        console.log("--- BOOTSTRAP FINALIZADO COM SUCESSO ---");

    } catch (err) {
        console.error("ERRO NO BOOTSTRAP:", err);
    } finally {
        await client.end();
    }
}

bootstrap();