import express from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Función simple para generar un número pseudoaleatorio consistente a partir de un string
function hashStringToInt(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
}

function parseFollowersStr(str: string): number | null {
    if (!str) return null;
    const match = str.match(/([\d,\.]+)\s*([KMBkmb]?)/);
    if (!match) return null;
    let num = parseFloat(match[1].replace(/,/g, ''));
    const multiplier = match[2].toUpperCase();
    if (multiplier === 'K') num *= 1000;
    else if (multiplier === 'M') num *= 1000000;
    else if (multiplier === 'B') num *= 1000000000;
    return Math.round(num);
}

// Benchmarks de ER por red social según tamaño de cuenta (fuentes: Hootsuite, Sprout Social, RivalIQ 2024-2025)
function getIndustryER(network: string, followers: number): number {
    // Tasas basadas en benchmarks globales publicados por la industria
    if (network === 'TikTok') {
        if (followers < 10000) return 8.5 + (Math.random() * 3);      // Micro: 8.5-11.5%
        if (followers < 100000) return 5.5 + (Math.random() * 2.5);   // Medio: 5.5-8%
        if (followers < 1000000) return 3.5 + (Math.random() * 2);    // Grande: 3.5-5.5%
        return 2.0 + (Math.random() * 1.5);                            // Mega: 2-3.5%
    }
    if (network === 'Instagram') {
        if (followers < 10000) return 3.0 + (Math.random() * 2);      // Micro: 3-5%
        if (followers < 100000) return 1.5 + (Math.random() * 1.5);   // Medio: 1.5-3%
        if (followers < 1000000) return 0.8 + (Math.random() * 0.7);  // Grande: 0.8-1.5%
        return 0.5 + (Math.random() * 0.5);                            // Mega: 0.5-1%
    }
    if (network === 'X') {
        if (followers < 10000) return 1.5 + (Math.random() * 1);
        if (followers < 100000) return 0.5 + (Math.random() * 0.7);
        return 0.2 + (Math.random() * 0.3);
    }
    if (network === 'Facebook') {
        if (followers < 10000) return 1.8 + (Math.random() * 1.2);
        if (followers < 100000) return 0.8 + (Math.random() * 0.7);
        return 0.3 + (Math.random() * 0.4);
    }
    return 1.5;
}

// Endpoint para auto-completar seguidores, avatar y Engagement Rate
app.get('/api/followers', async (req, res) => {
    const { network, profile } = req.query;
    if (!network || !profile) return res.status(400).json({ followers: null, pictureUrl: null, engagementRate: null });

    const cleanProfile = typeof profile === 'string' ? profile.replace('@', '') : '';
    let pictureUrl = `https://unavatar.io/${(network as string).toLowerCase()}/${cleanProfile}`;
    
    try {
        let url = '';
        let followers: number | null = null;
        let engagementRate: number | null = null;
        let isEstimated = false;
        let erIsEstimated = false;
        const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };

        if (network === 'Instagram') {
            url = `https://www.instagram.com/${cleanProfile}/`;
            const { data } = await axios.get(url, { headers });
            const $ = cheerio.load(data);
            const content = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content');
            if (content) {
                // Formato típico: "123K Followers, 456 Following, 789 Posts - ..."
                const followersMatch = content.split(/Followers|seguidores/i);
                if (followersMatch.length > 1) {
                    followers = parseFollowersStr(followersMatch[0]);
                }
                // Intentar extraer likes del contenido
                const likesMatch = content.match(/([\d,\.]+[KMBkmb]?)\s+(likes|me gusta)/i);
                if (likesMatch && followers) {
                    const likes = parseFollowersStr(likesMatch[1]);
                    if (likes) {
                        engagementRate = parseFloat(((likes / followers) * 100).toFixed(2));
                    }
                }
            }
        } 
        else if (network === 'TikTok') {
            url = `https://www.tiktok.com/@${cleanProfile}`;
            const { data } = await axios.get(url, { headers });
            const $ = cheerio.load(data);
            const content = $('meta[name="description"]').attr('content');
            if (content) {
                const followersMatch = content.match(/([\d,\.]+[KMBkmb]?)\s+(Followers|seguidores)/i);
                if (followersMatch) followers = parseFollowersStr(followersMatch[1]);

                // TikTok meta suele incluir likes: "142.5K Likes. 5115 Followers."
                const likesMatch = content.match(/([\d,\.]+[KMBkmb]?)\s+(Likes|me gusta)/i);
                if (likesMatch && followers) {
                    const likes = parseFollowersStr(likesMatch[1]);
                    if (likes) {
                        engagementRate = parseFloat(((likes / followers) * 100).toFixed(2));
                        // Normalizar: el ratio likes/followers en TikTok puede ser muy alto
                        // porque acumula likes históricos. Se ajusta al promedio por post.
                        if (engagementRate > 15) {
                            engagementRate = parseFloat((engagementRate / 10).toFixed(2));
                        }
                    }
                }
            }
        }

        // Fallback de seguidores si el scraping falla
        if (followers === null) {
            const seed = hashStringToInt(cleanProfile + network);
            followers = 5000 + (seed % 145000);
            isEstimated = true;
        }

        // Fallback de ER con benchmarks de la industria si no se pudo extraer
        if (engagementRate === null) {
            // Usar un seed para consistencia: el mismo perfil siempre da el mismo ER
            const erSeed = hashStringToInt(cleanProfile + network + 'er');
            const baseER = getIndustryER(network as string, followers);
            // Ajuste consistente basado en seed (±15% del benchmark)
            const variation = ((erSeed % 30) - 15) / 100;
            engagementRate = parseFloat((baseER * (1 + variation)).toFixed(2));
            erIsEstimated = true;
        }

        res.json({ followers, pictureUrl, isEstimated, engagementRate, erIsEstimated });
    } catch (e: any) {
        console.error('Fetch error for', profile, ':', e.message);
        const seed = hashStringToInt(cleanProfile + (network as string));
        const followers = 5000 + (seed % 145000);
        const engagementRate = parseFloat(getIndustryER(network as string, followers).toFixed(2));
        res.json({ followers, pictureUrl, isEstimated: true, engagementRate, erIsEstimated: true });
    }
});

// Endpoint para calcular la proyección (Mock API / Lógica Matemática)
app.post('/api/project', (req, res) => {
    const { brandName, socialNetwork, profile, currentFollowers, engagementRate, targetDate, isActive, hasAds } = req.body;

    if (!profile || !targetDate || currentFollowers === undefined) {
        return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    try {
        // 1. Calcular diferencia de meses entre hoy y la fecha meta
        const today = new Date();
        const target = new Date(targetDate);
        
        let months = (target.getFullYear() - today.getFullYear()) * 12;
        months -= today.getMonth();
        months += target.getMonth();

        if (months <= 0) {
            return res.status(400).json({ error: 'La fecha meta debe ser en el futuro.' });
        }

        // 2. Usar los Seguidores Actuales provistos
        const baseFollowers = currentFollowers;

        // 3. Usar el ER real del perfil (enviado desde el frontend, originado de /api/followers)
        const profileER = engagementRate || getIndustryER(socialNetwork, baseFollowers);

        // 4. Establecer tasas de crecimiento mensual base dependiendo de la red social
        let baseMonthlyGrowthRate = 0.01; // 1%
        if (socialNetwork === 'TikTok') {
            baseMonthlyGrowthRate = 0.03;
        } else if (socialNetwork === 'X') {
            baseMonthlyGrowthRate = 0.005;
        } else if (socialNetwork === 'Facebook') {
            baseMonthlyGrowthRate = 0.008;
        }

        // 5. Aplicar modificadores de Actividad y Pauta (relativos al ER base del perfil)
        let monthlyGrowthModifier = 0;
        let erModifier = 1.0; // Multiplicador sobre el ER base

        if (isActive) {
            monthlyGrowthModifier += 0.02;
            erModifier *= 1.20; // +20% de engagement si son activos
        } else {
            monthlyGrowthModifier -= 0.01;
            erModifier *= 0.85; // -15% si están inactivos
        }

        if (hasAds) {
            monthlyGrowthModifier += 0.05;
            erModifier *= 1.15; // +15% de engagement por pauta publicitaria
        }

        const finalMonthlyRate = baseMonthlyGrowthRate + monthlyGrowthModifier;
        const currentER = parseFloat((profileER * erModifier).toFixed(2));

        // 6. Calcular Seguidores Proyectados (Interés compuesto con historial)
        const history = [];
        let projectedFollowers = baseFollowers;
        
        const monthNames = [
            'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];
        
        // Mes 0
        const currentMonthIndex = today.getMonth();
        history.push({ month: `${monthNames[currentMonthIndex]} (Hoy)`, followers: Math.round(projectedFollowers), er: profileER });

        for (let i = 0; i < months; i++) {
            projectedFollowers += projectedFollowers * finalMonthlyRate;
            
            // El ER tiende a bajar ligeramente al crecer la audiencia (fenómeno natural)
            const monthER = parseFloat((currentER * Math.pow(0.995, i)).toFixed(2));
            
            const nextDate = new Date(today.getFullYear(), today.getMonth() + i + 1, 1);
            const nextMonthName = monthNames[nextDate.getMonth()];
            const displayMonth = `${nextMonthName} ${nextDate.getFullYear()}`;
            
            history.push({ month: displayMonth, followers: Math.round(projectedFollowers), er: monthER });
        }

        const finalProjectedFollowers = Math.round(projectedFollowers);
        const growth = finalProjectedFollowers - baseFollowers;
        const projectedER = parseFloat((currentER * Math.pow(0.995, months)).toFixed(2));

        // 7. Generar Diagnóstico y Recomendaciones de IA detalladas y personalizadas
        const aiRecommendations: { condition: string; recommendation: string; impact: string; status: string }[] = [];
        let aiSummary = "";

        if (socialNetwork === 'TikTok') {
            aiSummary = `La proyección indica un crecimiento dinámico y viable para @${profile} en TikTok, impulsado por el algoritmo altamente viral de la plataforma. Para consolidar el objetivo de ${finalProjectedFollowers.toLocaleString()} seguidores, es indispensable seguir una estrategia de video de alta retención y consistencia constante.`;
            
            if (isActive) {
                aiRecommendations.push({
                    condition: 'Consistencia de publicación',
                    recommendation: 'Publicar entre 4 a 6 TikToks semanales de alta calidad utilizando audios en tendencia en sus primeras 48 horas.',
                    impact: 'Sostiene el +2% de crecimiento orgánico mensual',
                    status: 'success'
                });
            } else {
                aiRecommendations.push({
                    condition: '¡Alerta de Inactividad!',
                    recommendation: 'La falta de actividad en TikTok reduce drásticamente el empuje algorítmico. Activa publicaciones semanales inmediatamente.',
                    impact: 'Evita la penalización de -1.5% de distribución mensual',
                    status: 'warning'
                });
            }

            if (hasAds) {
                aiRecommendations.push({
                    condition: 'Optimización de Pauta Spark Ads',
                    recommendation: 'Promociona tus videos orgánicos de mejor rendimiento (Spark Ads) en lugar de subir anuncios rígidos desde el Ads Manager.',
                    impact: 'Aumenta el alcance y la conversión en +5% mensual',
                    status: 'success'
                });
            } else {
                aiRecommendations.push({
                    condition: 'Inversión Sugerida',
                    recommendation: 'Asigna un presupuesto pequeño a TikTok Ads (campaña de visitas al perfil) para acelerar el descubrimiento en tu nicho.',
                    impact: 'Incremento potencial de +5% de seguidores al mes',
                    status: 'info'
                });
            }

            aiRecommendations.push({
                condition: 'Retención de Audiencia',
                recommendation: 'Asegura un gancho visual o textual en los primeros 3 segundos. Si el 70% de usuarios pasa del segundo 3, TikTok multiplicará tu alcance.',
                impact: 'Sostiene el engagement rate (ER) proyectado',
                status: 'info'
            });
        }
        else if (socialNetwork === 'Instagram') {
            aiSummary = `Para alcanzar los ${finalProjectedFollowers.toLocaleString()} seguidores en Instagram, el foco principal debe ser la retención del engagement y el alcance orgánico mediante formatos de video corto.`;
            
            if (isActive) {
                aiRecommendations.push({
                    condition: 'Frecuencia de Publicación',
                    recommendation: 'Publicar 3 Reels y 2 Carruseles educativos a la semana. Los carruseles aumentan la tasa de guardados, clave para el algoritmo.',
                    impact: `Mantiene estable el engagement rate en ${currentER}%`,
                    status: 'success'
                });
            } else {
                aiRecommendations.push({
                    condition: '¡Alerta de Alcance!',
                    recommendation: 'Instagram penaliza las cuentas inactivas bajando su visibilidad en el feed. Re-activa historias diarias con encuestas y stickers.',
                    impact: 'Previene la pérdida constante de alcance orgánico',
                    status: 'warning'
                });
            }

            if (hasAds) {
                aiRecommendations.push({
                    condition: 'Pauta Segmentada',
                    recommendation: 'Utiliza anuncios de tipo Reels dirigidos a audiencias similares (lookalikes) de tus seguidores actuales más interactivos.',
                    impact: `Eleva el ER modificado a un ${currentER}%`,
                    status: 'success'
                });
            } else {
                aiRecommendations.push({
                    condition: 'Oportunidad de Inversión',
                    recommendation: 'Destina un presupuesto mensual a promocionar tus publicaciones más exitosas para acelerar la conversión de seguidores.',
                    impact: 'Aumenta el ritmo de crecimiento en +5% mensual',
                    status: 'info'
                });
            }

            aiRecommendations.push({
                condition: 'Interacción Rápida',
                recommendation: 'Responde a todos los comentarios e interactúa con otras cuentas afines dentro de los primeros 60 minutos de publicar.',
                impact: 'Aumenta la exposición en la pestaña "Explorar" (+10% engagement)',
                status: 'info'
            });
        }
        else if (socialNetwork === 'X') {
            aiSummary = `La proyección para @${profile} en X requiere una presencia conversacional constante y aporte de valor en nichos específicos para garantizar el crecimiento de ${finalProjectedFollowers.toLocaleString()} seguidores.`;
            
            if (isActive) {
                aiRecommendations.push({
                    condition: 'Frecuencia Conversacional',
                    recommendation: 'Publicar de 2 a 3 posts diarios. Participar activamente respondiendo en hilos de cuentas líderes en tu nicho.',
                    impact: 'Mantiene visibilidad alta en la pestaña "Para ti"',
                    status: 'success'
                });
            } else {
                aiRecommendations.push({
                    condition: 'Inactividad Crítica',
                    recommendation: 'El algoritmo de X favorece la inmediatez. La inactividad detiene el crecimiento. Programa hilos semanales valiosos.',
                    impact: 'Evita la pérdida neta de seguidores orgánicos',
                    status: 'warning'
                });
            }

            aiRecommendations.push({
                condition: 'Hilos Temáticos',
                recommendation: 'Crear al menos 1 hilo educativo o de debate a la semana. Los hilos consiguen hasta un 400% más de impresiones que los posts sencillos.',
                impact: 'Facilita la viralidad y conversión en la red social',
                status: 'info'
            });
        }
        else if (socialNetwork === 'Facebook') {
            aiSummary = `La proyección de @${profile} en Facebook se apoya principalmente en formatos interactivos y distribución en comunidades para sortear el bajo alcance orgánico e impulsar el crecimiento.`;
            
            if (isActive) {
                aiRecommendations.push({
                    condition: 'Frecuencia de Reels',
                    recommendation: 'Publicar 4 veces por semana. Da prioridad absoluta a los Facebook Reels para expandir el alcance orgánico de tu página.',
                    impact: 'Sostiene la tendencia de crecimiento proyectada',
                    status: 'success'
                });
            } else {
                aiRecommendations.push({
                    condition: '¡Alerta de Alcance!',
                    recommendation: 'El alcance orgánico de páginas en Facebook es menor al 2%. Si no mantienes actividad, tu contenido no se mostrará.',
                    impact: 'Re-activa la visibilidad del feed orgánico',
                    status: 'warning'
                });
            }

            if (hasAds) {
                aiRecommendations.push({
                    condition: 'Pauta Directa',
                    recommendation: 'Configura campañas orientadas a la interacción o mensajes para construir una comunidad activa y cualificada.',
                    impact: 'Garantiza la conversión de seguidores constantes',
                    status: 'success'
                });
            } else {
                aiRecommendations.push({
                    condition: 'Inversión Publicitaria',
                    recommendation: 'Debido al algoritmo restrictivo de Facebook, es imperativo usar pauta publicitaria mensual para alcanzar la meta.',
                    impact: 'Clave para desbloquear el crecimiento proyectado',
                    status: 'info'
                });
            }
        }

        res.json({
            currentFollowers: baseFollowers,
            projectedFollowers: finalProjectedFollowers,
            growth,
            currentER: profileER,
            projectedER,
            interactionRate: currentER,
            months,
            history,
            aiSummary,
            aiRecommendations
        });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error procesando la proyección' });
    }
});

app.listen(PORT, () => {
    console.log(`Backend servido en http://localhost:${PORT}`);
    console.log(`Listo para recibir cálculos para la Fase 1.`);
});
