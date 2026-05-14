import { getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where, orderBy, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export class PRStrategyManager {
    constructor(db) {
        this.db = db;
        this.collections = {
            publications: 'prPublications',
            outreach: 'prOutreach',
            backlinks: 'prBacklinks',
            directories: 'prDirectories',
            pressKit: 'prPressKit',
            campaigns: 'prCampaigns'
        };
    }

    async addPublication(publicationData) {
        const data = {
            ...publicationData,
            status: publicationData.status || 'not-contacted',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };
        
        const docRef = await addDoc(collection(this.db, this.collections.publications), data);
        return { id: docRef.id, ...data };
    }

    async updatePublication(publicationId, updates) {
        const docRef = doc(this.db, this.collections.publications, publicationId);
        await updateDoc(docRef, {
            ...updates,
            updatedAt: serverTimestamp()
        });
    }

    async getPublications(filters = {}) {
        let q = collection(this.db, this.collections.publications);
        
        if (filters.type) {
            q = query(q, where('type', '==', filters.type));
        }
        
        if (filters.status) {
            q = query(q, where('status', '==', filters.status));
        }
        
        if (filters.priority) {
            q = query(q, where('priority', '==', filters.priority));
        }
        
        q = query(q, orderBy('createdAt', 'desc'));
        
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async createOutreachCampaign(campaignData) {
        const data = {
            ...campaignData,
            status: campaignData.status || 'planned',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };
        
        const docRef = await addDoc(collection(this.db, this.collections.outreach), data);
        return { id: docRef.id, ...data };
    }

    async updateOutreachCampaign(campaignId, updates) {
        const docRef = doc(this.db, this.collections.outreach, campaignId);
        await updateDoc(docRef, {
            ...updates,
            updatedAt: serverTimestamp()
        });
    }

    async getOutreachCampaigns(filters = {}) {
        let q = collection(this.db, this.collections.outreach);
        
        if (filters.status) {
            q = query(q, where('status', '==', filters.status));
        }
        
        if (filters.contentType) {
            q = query(q, where('contentType', '==', filters.contentType));
        }
        
        q = query(q, orderBy('createdAt', 'desc'));
        
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async addBacklink(backlinkData) {
        const data = {
            ...backlinkData,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };
        
        const docRef = await addDoc(collection(this.db, this.collections.backlinks), data);
        return { id: docRef.id, ...data };
    }

    async getBacklinks(filters = {}) {
        let q = collection(this.db, this.collections.backlinks);
        
        if (filters.anchorType) {
            q = query(q, where('anchorType', '==', filters.anchorType));
        }
        
        q = query(q, orderBy('createdAt', 'desc'));
        
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async calculateAnchorTextDistribution() {
        const backlinks = await this.getBacklinks();
        
        const distribution = {
            branded: 0,
            naked: 0,
            keyword: 0,
            total: backlinks.length
        };
        
        backlinks.forEach(backlink => {
            if (backlink.anchorType === 'branded') {
                distribution.branded++;
            } else if (backlink.anchorType === 'naked') {
                distribution.naked++;
            } else if (backlink.anchorType === 'keyword') {
                distribution.keyword++;
            }
        });
        
        if (distribution.total > 0) {
            distribution.brandedPercentage = (distribution.branded / distribution.total) * 100;
            distribution.nakedPercentage = (distribution.naked / distribution.total) * 100;
            distribution.keywordPercentage = (distribution.keyword / distribution.total) * 100;
        } else {
            distribution.brandedPercentage = 0;
            distribution.nakedPercentage = 0;
            distribution.keywordPercentage = 0;
        }
        
        return distribution;
    }

    async addDirectory(directoryData) {
        const data = {
            ...directoryData,
            status: directoryData.status || 'planned',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };
        
        const docRef = await addDoc(collection(this.db, this.collections.directories), data);
        return { id: docRef.id, ...data };
    }

    async updateDirectory(directoryId, updates) {
        const docRef = doc(this.db, this.collections.directories, directoryId);
        await updateDoc(docRef, {
            ...updates,
            updatedAt: serverTimestamp()
        });
    }

    async getDirectories(filters = {}) {
        let q = collection(this.db, this.collections.directories);
        
        if (filters.type) {
            q = query(q, where('type', '==', filters.type));
        }
        
        if (filters.status) {
            q = query(q, where('status', '==', filters.status));
        }
        
        q = query(q, orderBy('createdAt', 'desc'));
        
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async addPressKitItem(itemData) {
        const data = {
            ...itemData,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };
        
        const docRef = await addDoc(collection(this.db, this.collections.pressKit), data);
        return { id: docRef.id, ...data };
    }

    async getPressKitItems(type = null) {
        let q = collection(this.db, this.collections.pressKit);
        
        if (type) {
            q = query(q, where('type', '==', type));
        }
        
        q = query(q, orderBy('createdAt', 'desc'));
        
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async getStatistics() {
        const [publications, outreach, backlinks, directories] = await Promise.all([
            this.getPublications(),
            this.getOutreachCampaigns(),
            this.getBacklinks(),
            this.getDirectories()
        ]);

        const publicationsByStatus = publications.reduce((acc, pub) => {
            acc[pub.status] = (acc[pub.status] || 0) + 1;
            return acc;
        }, {});

        const outreachByStatus = outreach.reduce((acc, campaign) => {
            acc[campaign.status] = (acc[campaign.status] || 0) + 1;
            return acc;
        }, {});

        const directoriesByStatus = directories.reduce((acc, dir) => {
            acc[dir.status] = (acc[dir.status] || 0) + 1;
            return acc;
        }, {});

        const anchorDistribution = await this.calculateAnchorTextDistribution();

        return {
            totalPublications: publications.length,
            totalOutreach: outreach.length,
            totalBacklinks: backlinks.length,
            totalDirectories: directories.length,
            publicationsByStatus,
            outreachByStatus,
            directoriesByStatus,
            anchorDistribution,
            activeOutreach: outreach.filter(c => ['planned', 'sent', 'follow-up'].includes(c.status)).length,
            publishedArticles: publications.filter(p => p.status === 'published').length,
            completedDirectories: directories.filter(d => d.status === 'completed').length
        };
    }

    async createSeasonalCampaign(season, year) {
        const seasonalTemplates = {
            harvest: {
                title: `Raccolta ${year} - Storia dell'Oliveto`,
                contentType: 'harvest-story',
                period: 'October-December',
                description: 'Documentazione processo raccolta, tradizioni familiari, qualità del raccolto',
                targets: ['Gambero Rosso', 'Slow Food Italia', 'La Cucina Italiana']
            },
            olioNovello: {
                title: `Lancio Olio Novello ${year}`,
                contentType: 'olio-novello',
                period: 'November',
                description: 'Annuncio disponibilità olio novello, caratteristiche organolettiche',
                targets: ['The Olive Oil Times', 'Italian Food Excellence']
            },
            giftGuide: {
                title: `Gift Guide Natale ${year}`,
                contentType: 'gift-guide',
                period: 'November-December',
                description: 'Inclusione nelle guide regalo natalizie, confezioni speciali',
                targets: ['Food bloggers', 'Lifestyle magazines']
            }
        };

        const template = seasonalTemplates[season];
        if (!template) {
            throw new Error('Invalid season');
        }

        const campaign = await this.createOutreachCampaign({
            ...template,
            year,
            seasonal: true,
            status: 'planned'
        });

        return campaign;
    }

    async generatePitchTemplate(type) {
        const pitchTemplates = {
            'harvest-story': {
                subject: 'Storia della Raccolta: Tradizione Olivicola Siciliana',
                body: `Gentile [Nome],

Sono [Nome] di l'Olio di Valeria, un'azienda agricola familiare di San Biagio Platani (AG).

Vorremmo condividere con voi la storia della nostra raccolta olivicola, che rappresenta:
- Tradizione familiare tramandata da generazioni
- Processo produttivo artigianale e certificato
- Innovazione: bottiglie ceramica Testa di Moro uniche

Disponibili per:
- Foto alta risoluzione dell'oliveto e del processo produttivo
- Intervista al produttore
- Campioni prodotto per degustazione

Cordiali saluti,
L'Olio di Valeria`
            },
            'recipe-collaboration': {
                subject: 'Collaborazione Ricette con Olio EVO Premium',
                body: `Ciao [Nome],

Siamo ammiratori del tuo lavoro e della tua passione per la cucina italiana autentica.

Proponiamo una collaborazione per sviluppare ricette che valorizzino:
- Olio extravergine di oliva biologico siciliano
- Prodotto artigianale in bottiglie ceramica artistiche
- Storytelling tradizione agricola siciliana

Offriamo:
- Fornitura prodotto per testing ricette
- Materiale fotografico alta qualità
- Visibilità reciproca sui nostri canali

Interessato/a a collaborare?

Cordiali saluti,
L'Olio di Valeria`
            },
            'gift-guide': {
                subject: 'Gift Guide: Idea Regalo Gourmet Unica',
                body: `Gentile [Nome],

In vista delle festività, proponiamo l'inclusione nelle vostre gift guide di:

**l'Olio di Valeria - Edizione Speciale Testa di Moro**
- Olio EVO premium in bottiglia ceramica artistica
- Ideale come regalo gourmet distintivo
- Packaging luxury, prodotto artigianale siciliano

Disponibili:
- Immagini alta risoluzione
- Informazioni prodotto e prezzi
- Campioni per valutazione

Deadline: [Data]

Grazie per la considerazione!

L'Olio di Valeria`
            }
        };

        return pitchTemplates[type] || null;
    }
}

export const initializePRDefaults = async (db) => {
    const defaultPublications = [
        {
            name: 'Gambero Rosso',
            type: 'food-magazine',
            website: 'https://www.gamberorosso.it',
            email: 'redazione@gamberorosso.it',
            priority: 'high',
            status: 'not-contacted',
            notes: 'Principale rivista enogastronomica italiana'
        },
        {
            name: 'Slow Food Italia',
            type: 'food-magazine',
            website: 'https://www.slowfood.it',
            priority: 'high',
            status: 'not-contacted',
            notes: 'Focus su produzione sostenibile e tradizionale'
        },
        {
            name: 'La Cucina Italiana',
            type: 'food-magazine',
            website: 'https://www.lacucinaitaliana.it',
            priority: 'high',
            status: 'not-contacted',
            notes: 'Magazine cucina con ampia diffusione'
        },
        {
            name: 'The Olive Oil Times',
            type: 'food-magazine',
            website: 'https://www.oliveoiltimes.com',
            priority: 'high',
            status: 'not-contacted',
            notes: 'Specializzato in olio di oliva internazionale'
        },
        {
            name: 'Italian Food Excellence',
            type: 'food-magazine',
            website: 'https://www.italianfoodexcellence.com',
            priority: 'high',
            status: 'not-contacted',
            notes: 'Eccellenze food Made in Italy'
        }
    ];

    const defaultDirectories = [
        {
            name: 'Google Business Profile',
            type: 'google-business',
            status: 'planned',
            priority: 'high',
            notes: 'Essenziale per SEO locale e visibilità ricerche Google'
        },
        {
            name: 'TheFork',
            type: 'thefork',
            status: 'planned',
            priority: 'medium',
            notes: 'Se si offrono visite aziendali con degustazione'
        },
        {
            name: 'TripAdvisor',
            type: 'tripadvisor',
            status: 'planned',
            priority: 'medium',
            notes: 'Per recensioni visite aziendali'
        },
        {
            name: 'ICEA - Certificazione Biologica',
            type: 'organic-cert',
            status: 'planned',
            priority: 'high',
            notes: 'Directory certificazioni biologiche'
        }
    ];

    const publicationsRef = collection(db, 'prPublications');
    const pubSnapshot = await getDocs(publicationsRef);
    
    if (pubSnapshot.empty) {
        for (const pub of defaultPublications) {
            await addDoc(publicationsRef, {
                ...pub,
                createdAt: serverTimestamp()
            });
        }
    }

    const directoriesRef = collection(db, 'prDirectories');
    const dirSnapshot = await getDocs(directoriesRef);
    
    if (dirSnapshot.empty) {
        for (const dir of defaultDirectories) {
            await addDoc(directoriesRef, {
                ...dir,
                createdAt: serverTimestamp()
            });
        }
    }
};
