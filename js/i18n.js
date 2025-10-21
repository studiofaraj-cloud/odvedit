/**
 * Internationalization (i18n) Module for l'Olio di Valeria
 * Provides language detection, switching, and translation capabilities
 * Default language: Italian (it)
 * Supported languages: Italian (it), English (en)
 */

class I18n {
  constructor() {
    this.currentLang = "it"
    this.translations = {}
    this.defaultLang = "it"
  }

  /**
   * Detect user's preferred language
   * @returns {string} Language code (it or en)
   */
  detectLanguage() {
    return "it"
  }

  /**
   * Set current language
   * @param {string} lang - Language code (it or en)
   */
  setLanguage(lang) {
    if (!["it", "en"].includes(lang)) {
      console.warn(`Unsupported language: ${lang}. Defaulting to Italian.`)
      lang = "it"
    }

    this.currentLang = lang
    document.documentElement.setAttribute("lang", lang)

    // Dispatch custom event for language change
    window.dispatchEvent(new CustomEvent("languageChanged", { detail: { lang } }))
  }

  /**
   * Get current language
   * @returns {string} Current language code
   */
  getCurrentLanguage() {
    return this.currentLang
  }

  /**
   * Register translations for a specific language
   * @param {string} lang - Language code
   * @param {object} translations - Translation key-value pairs
   */
  registerTranslations(lang, translations) {
    if (!this.translations[lang]) {
      this.translations[lang] = {}
    }
    this.translations[lang] = { ...this.translations[lang], ...translations }
  }

  /**
   * Get translation for a key
   * @param {string} key - Translation key
   * @param {object} params - Optional parameters for string interpolation
   * @returns {string} Translated string
   */
  t(key, params = {}) {
    const langTranslations = this.translations[this.currentLang] || {}
    let translation = langTranslations[key]

    // Fallback to default language if translation not found
    if (!translation) {
      translation = (this.translations[this.defaultLang] || {})[key]
    }

    // If still not found, return the key itself
    if (!translation) {
      console.warn(`Translation not found for key: ${key}`)
      return key
    }

    // Simple string interpolation
    return translation.replace(/\{(\w+)\}/g, (match, param) => {
      return params[param] !== undefined ? params[param] : match
    })
  }

  /**
   * Switch to the other language (toggle between it and en)
   */
  toggleLanguage() {
    const newLang = this.currentLang === "it" ? "en" : "it"
    this.setLanguage(newLang)
  }

  /**
   * Get page filename mappings between Italian and English versions
   * @returns {object} Object with it_to_en and en_to_it mappings
   */
  getPageMappings() {
    return {
      it_to_en: {
        "index.html": "index.html",
        "prodotti.html": "products.html",
        "chi-siamo.html": "about.html",
        "dove-siamo.html": "location.html",
        "contatti.html": "contact.html",
        "azienda.html": "company.html",
        "qualita.html": "quality.html",
        "shop.html": "shop.html",
      },
      en_to_it: {
        "index.html": "index.html",
        "products.html": "prodotti.html",
        "about.html": "chi-siamo.html",
        "location.html": "dove-siamo.html",
        "contact.html": "contatti.html",
        "company.html": "azienda.html",
        "quality.html": "qualita.html",
        "shop.html": "shop.html",
      },
    }
  }

  /**
   * Rewrite navigation links dynamically based on current language
   * Should be called on page load and after language changes
   */
  rewriteNavigationLinks() {
    const currentLang = this.getCurrentLanguage()
    const mappings = this.getPageMappings()
    const basePath = currentLang === "en" ? "/en/" : "/"

    // Find all internal links (ending in .html or pointing to .html files)
    const links = document.querySelectorAll("a[href]")

    links.forEach((link) => {
      const href = link.getAttribute("href")

      // Skip empty hrefs, external links, anchors, and javascript: links
      if (
        !href ||
        href.startsWith("http://") ||
        href.startsWith("https://") ||
        href.startsWith("//") ||
        href.startsWith("javascript:") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href === "#" ||
        (href.startsWith("#") && !href.includes(".html"))
      ) {
        return
      }

      // Extract filename and hash/query
      const urlParts = href.split("#")
      const pathAndQuery = urlParts[0].split("?")
      const path = pathAndQuery[0]
      const query = pathAndQuery[1] ? "?" + pathAndQuery[1] : ""
      const hash = urlParts[1] ? "#" + urlParts[1] : ""

      // Handle relative paths and extract filename
      let fileName = path.split("/").pop()

      // Only process if it's an HTML file or empty (root path)
      if (!fileName.endsWith(".html") && fileName !== "") {
        return
      }

      // If no filename, assume index.html
      if (fileName === "" || fileName === "/") {
        fileName = "index.html"
      }

      let targetFile = fileName

      // Map to appropriate language version
      if (currentLang === "en") {
        targetFile = mappings.it_to_en[fileName] || fileName
      } else {
        targetFile = mappings.en_to_it[fileName] || fileName
      }

      // Update the href - use absolute path from root
      const newHref = `${basePath}${targetFile}${query}${hash}`
      link.setAttribute("href", newHref)

      // Store original href as data attribute for debugging
      if (!link.hasAttribute("data-original-href")) {
        link.setAttribute("data-original-href", href)
      }
    })

    console.log(`Rewrote navigation links for language: ${currentLang}`)
  }

  /**
   * Apply translations to elements with data-i18n attribute
   */
  translatePage() {
    // Add translating class for fade effect
    document.querySelectorAll("[data-i18n], [data-i18n-placeholder], [data-i18n-title]").forEach((element) => {
      element.classList.add("translating")
    })

    // Wait for fade out, then change text
    setTimeout(() => {
      const elements = document.querySelectorAll("[data-i18n]")
      const supportedAttrs = ["alt", "placeholder", "title", "aria-label"]

      elements.forEach((element) => {
        try {
          // Translate text content
          const textKey = element.getAttribute("data-i18n")
          if (textKey) {
            const translation = this.t(textKey)
            if (translation !== textKey || this.translations[this.currentLang]?.[textKey]) {
              element.textContent = translation
            } else {
              console.warn(`Missing translation key: ${textKey}`)
            }
          }

          // Translate HTML attributes
          const attrConfig = element.getAttribute("data-i18n-attr")
          if (attrConfig) {
            try {
              // Parse JSON configuration: e.g., {"alt": "key.alt", "placeholder": "key.placeholder"}
              const attrMap = JSON.parse(attrConfig)

              Object.keys(attrMap).forEach((attr) => {
                if (supportedAttrs.includes(attr)) {
                  const attrKey = attrMap[attr]
                  const translation = this.t(attrKey)

                  if (translation !== attrKey || this.translations[this.currentLang]?.[attrKey]) {
                    element.setAttribute(attr, translation)
                  } else {
                    console.warn(`Missing translation key for attribute ${attr}: ${attrKey}`)
                  }
                } else {
                  console.warn(`Unsupported attribute in data-i18n-attr: ${attr}`)
                }
              })
            } catch (parseError) {
              console.warn(`Failed to parse data-i18n-attr for element:`, element, parseError)
            }
          }
        } catch (error) {
          console.error(`Error translating element:`, element, error)
        }
      })

      // Translate placeholder attributes (legacy support)
      document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
        const key = element.getAttribute("data-i18n-placeholder")
        try {
          const translation = this.t(key)
          if (translation !== key || this.translations[this.currentLang]?.[key]) {
            element.setAttribute("placeholder", translation)
          } else {
            console.warn(`Missing translation key for placeholder: ${key}`)
          }
        } catch (error) {
          console.error(`Error translating placeholder for element:`, element, error)
        }
      })

      // Translate title attributes (legacy support)
      document.querySelectorAll("[data-i18n-title]").forEach((element) => {
        const key = element.getAttribute("data-i18n-title")
        try {
          const translation = this.t(key)
          if (translation !== key || this.translations[this.currentLang]?.[key]) {
            element.setAttribute("title", translation)
          } else {
            console.warn(`Missing translation key for title: ${key}`)
          }
        } catch (error) {
          console.error(`Error translating title for element:`, element, error)
        }
      })

      // Remove translating class after a small delay to allow content update
      requestAnimationFrame(() => {
        document.querySelectorAll("[data-i18n], [data-i18n-placeholder], [data-i18n-title]").forEach((element) => {
          element.classList.remove("translating")
        })
      })
    }, 150) // Half of the transition duration
  }
}

// Initialize i18n instance
const i18n = new I18n()

// Apply language setting and rewrite links on page load
document.addEventListener("DOMContentLoaded", () => {
  i18n.setLanguage("it")
  i18n.rewriteNavigationLinks()
  i18n.translatePage()
})

// Rewrite links when language changes
window.addEventListener("languageChanged", () => {
  i18n.rewriteNavigationLinks()
  i18n.translatePage()
})

// Common translations for Italian (default)
i18n.registerTranslations("it", {
  // Navigation
  "nav.home": "Home",
  "nav.products": "Prodotti",
  "nav.about": "Chi Siamo",
  "nav.location": "Dove Siamo",
  "nav.contact": "Contatti",
  "nav.company": "L'Azienda Agricola",
  "nav.quality": "Qualità",
  "nav.shop": "Shop",

  // Common buttons
  "btn.readMore": "Scopri di più",
  "btn.contact": "Contattaci",
  "btn.buyNow": "Acquista ora",
  "btn.addToCart": "Aggiungi al carrello",
  "btn.checkout": "Procedi al checkout",
  "btn.send": "Invia",

  // Footer
  "footer.copyright": "© 2024 l'Olio di Valeria. Tutti i diritti riservati.",
  "footer.followUs": "Seguici sui social",

  // Forms
  "form.name": "Nome",
  "form.email": "Email",
  "form.message": "Messaggio",
  "form.phone": "Telefono",

  // Messages
  "msg.success": "Operazione completata con successo",
  "msg.error": "Si è verificato un errore",
  "msg.loading": "Caricamento...",

  // Product descriptions
  "product.quadra.description":
    "Olio extravergine di oliva siciliano biologico e vegano in elegante bottiglia Quadra. Disponibile in formato 250ml, perfetto per uso quotidiano, e 500ml, ideale per famiglie. La sua forma distintiva protegge l'olio dalla luce e mantiene intatte le proprietà organolettiche.",
  "product.kingQuadra.description":
    "Edizione limitata del nostro olio premium in esclusiva bottiglia King Quadra da 500ml. Olio extravergine biologico e vegano di qualità superiore, perfetto per i veri intenditori. Il formato medio è ideale per esaltare i piatti speciali e le ricette gourmet.",
  "product.gradolio.description":
    "Olio extravergine siciliano biologico e vegano nella classica bottiglia Gradolio. Disponibile in 250ml per single e coppie, 500ml per l'uso quotidiano familiare, e 750ml per chi ama averlo sempre a disposizione. Versatile e raffinato per ogni preparazione.",
  "product.olea.description":
    "Olio extravergine biologico e vegano in bottiglia Olea dal design moderno. Formato 250ml pratico per piccole cucine e formato 500ml perfetto per l'uso quotidiano. Il contenitore protegge l'olio e ne esalta il colore dorato siciliano.",
  "product.oliena.description":
    "Olio extravergine di oliva biologico e vegano in raffinata bottiglia Oliena. Disponibile in 250ml, ottimo per viaggi e seconde case, e 500ml, formato versatile per ogni esigenza culinaria. Qualità premium per arricchire ogni piatto.",
  "product.marasca.description":
    "Olio extravergine biologico e vegano nella tradizionale bottiglia Marasca da 1 litro. Il formato famiglia per eccellenza, ideale per chi utilizza quotidianamente olio di qualità in cucina. Conveniente e pratico, mantiene l'olio fresco più a lungo.",
  "product.latta.description":
    "Olio extravergine biologico e vegano in latta protettiva da 3 e 5 litri. La scelta dei professionisti e delle famiglie numerose. I formati grandi garantiscono il miglior rapporto qualità-prezzo e protezione totale dalla luce. Perfetti per conservare l'eccellenza siciliana.",
  "product.spray.description":
    "Olio extravergine biologico e vegano in pratico formato spray da 100ml. Ideale per condire con precisione e senza sprechi. Perfetto per insalate, grigliate e finishing touch gourmet. Il dosatore spray consente un uso controllato e uniforme.",

  // Product titles
  "product.quadra.title": "QUADRA - L'OLIO DI VALERIA",
  "product.kingQuadra.title": "KING QUADRA - L'OLIO DI VALERIA",
  "product.gradolio.title": "GRADOLIO - L'OLIO DI VALERIA",
  "product.olea.title": "OLEA - L'OLIO DI VALERIA",
  "product.oliena.title": "OLIENA - L'OLIO DI VALERIA",
  "product.marasca.title": "MARASCA - L'OLIO DI VALERIA",
  "product.latta.title": "LATTA 3L/5L - L'OLIO DI VALERIA",
  "product.spray.title": "Spray - L'Olio di Valeria",

  // Shop interface
  "shop.badge.bestseller": "Bestseller",
  "shop.badge.limitedEdition": "Limited Edition",
  "shop.sizeLabel": "Scegli la dimensione:",
  "shop.addToCart": "Aggiungi al Carrello",

  // Breadcrumbs
  "breadcrumb.home": "Home",
  "breadcrumb.faq": "FAQ",

  // Hero sections
  "hero.faq.badge": "❓ Domande Frequenti",
  "hero.faq.title": "FAQ",
  "hero.faq.subtitle": "Trova le risposte alle domande più frequenti sui nostri prodotti, spedizioni e servizi",
  "hero.terms.badge": "📋 Informazioni Legali",
  "hero.terms.title": "Termini e Condizioni",
  "hero.terms.subtitle": "Condizioni generali di vendita e utilizzo del sito web",

  // Footer
  "footer.companyDescription":
    "Tradizione siciliana dal 1987. Olio extravergine di oliva di qualità superiore dalle terre di San Biagio Platani.",
  "footer.products": "Prodotti",
  "footer.company": "Azienda",
  "footer.contact": "Contatti",
  "footer.legalInfo": "Informazioni Legali",
  "footer.operatingOffice": "Sede Operativa:",
  "footer.phone": "Tel:",
  "footer.followUs": "Seguici Su",
  "footer.socialDescription": "Resta aggiornato sulle nostre novità",
  "footer.social.facebook": "Facebook",
  "footer.social.instagram": "Instagram",
  "footer.link.ourBottles": "Le Nostre Bottiglie",
  "footer.link.oilInTin": "Olio In Latta",
  "footer.link.giftBox": "Confezione Regalo",
  "footer.link.aboutUs": "Chi Siamo",
  "footer.link.farm": "L'azienda Agricola",
  "footer.link.quality": "Qualità",
  "footer.link.certifications": "Certificazioni",
  "footer.link.faq": "FAQ",
  "footer.link.terms": "Termini e Condizioni",
  "footer.link.privacy": "Cookies e Privacy Policy",

  // Quality page - Health benefits
  "quality.health.title": "Benefici per la Salute",
  "quality.health.intro":
    "Il nostro olio extravergine di oliva è ricco di componenti benefici che contribuiscono al benessere del tuo organismo.",
  "quality.health.vitaminE.title": "Vitamina E",
  "quality.health.vitaminE.description":
    "Potente antiossidante naturale che protegge le cellule dai danni dei radicali liberi.",
  "quality.health.monounsaturated.title": "Grassi Monoinsaturi",
  "quality.health.monounsaturated.description":
    "Favoriscono la salute cardiovascolare e aiutano a mantenere livelli ottimali di colesterolo.",
  "quality.health.oleicAcid.title": "Acido Oleico",
  "quality.health.oleicAcid.description":
    "Acido grasso essenziale che supporta il sistema immunitario e la salute della pelle.",
  "quality.health.palmiticAcid.title": "Acido Palmitico",
  "quality.health.palmiticAcid.description":
    "Contribuisce alla struttura delle membrane cellulari e al metabolismo energetico.",
  "quality.health.linoleicAcid.title": "Acido Linoleico",
  "quality.health.linoleicAcid.description":
    "Acido grasso omega-6 essenziale per la salute della pelle e del sistema nervoso.",
  "quality.health.stearicAcid.title": "Acido Stearico",
  "quality.health.stearicAcid.description":
    "Supporta la produzione di energia e mantiene la stabilità dell'olio nel tempo.",

  // Quality page - Control parameters
  "quality.control.badge": "Controllo Qualità",
  "quality.control.title": "Parametri di Eccellenza",
  "quality.control.intro":
    "Ogni lotto del nostro olio viene sottoposto a rigorosi controlli per garantire la massima qualità e purezza.",
  "quality.control.acidity.title": "Acidità",
  "quality.control.acidity.limit": "Limite legale: 0,80%",
  "quality.control.acidity.description":
    "Il nostro olio mantiene un'acidità eccezionalmente bassa, molto al di sotto dei limiti di legge, garantendo freschezza e qualità superiore.",
  "quality.control.polyphenols.title": "Polifenoli",
  "quality.control.polyphenols.value": "Valori Elevati",
  "quality.control.polyphenols.benefit": "Benefici cardiovascolari",
  "quality.control.polyphenols.description":
    "Ricchi di polifenoli naturali che prevengono l'invecchiamento e supportano il sistema circolatorio. I valori rimangono alti per tutto il primo anno.",
  "quality.control.peroxides.title": "Perossidi",
  "quality.control.peroxides.limit": "Limite massimo: 20",
  "quality.control.peroxides.description":
    "Bassi livelli di perossidi garantiscono che l'olio mantenga il suo sapore autentico e le sue proprietà organolettiche nel tempo.",
  "quality.control.guarantee.title": "Garanzia di Qualità",
  "quality.control.guarantee.description":
    "Ogni bottiglia di Olio di Valeria rappresenta l'eccellenza della tradizione olearia italiana, con controlli costanti che assicurano la massima qualità dal frantoio alla tua tavola.",

  // Quality page - Certifications
  "quality.certifications.title": "Le Nostre Certificazioni",
  "quality.certifications.intro":
    "La qualità dei nostri prodotti è garantita dalle più prestigiose certificazioni del settore alimentare.",
  "quality.certifications.organic.title": "Biologico",
  "quality.certifications.organic.description":
    "Certificazione biologica che garantisce prodotti naturali e sostenibili",
  "quality.certifications.vegan.title": "Vegano",
  "quality.certifications.vegan.description": "Prodotti completamente vegani, senza ingredienti di origine animale",
  "quality.certifications.slowFood.title": "Slow Food",
  "quality.certifications.slowFood.description":
    "Riconoscimento per la qualità e la tradizione dei nostri metodi di produzione",
  "quality.certifications.sicani.title": "Distretto Sicani",
  "quality.certifications.sicani.description": "Facciamo parte del Distretto Rurale di Qualità dei Sicani",

  // Where we are page
  "whereWeAre.ourHome.badge": "🏠 La Nostra Casa",
  "whereWeAre.ourHome.title": "San Biagio Platani",
  "whereWeAre.ourHome.description":
    "La sede della nostra Azienda Agricola è situata nel piccolo paesino di San Biagio Platani, nel cuore della meravigliosa Valle del Platani.",
  "whereWeAre.address.heading": "Indirizzo",
  "whereWeAre.address.country": "Sicilia, Italia",
  "whereWeAre.address.gpsLabel": "Coordinate GPS:",
  "whereWeAre.address.mapLink": "🗺️ Esplora su Maps",
  "whereWeAre.distances.heading": "Distanze dalle Città",
  "whereWeAre.distances.nearbyTitle": "Le Città Vicine",
  "whereWeAre.distances.agrigento": "Agrigento",
  "whereWeAre.distances.palermo": "Palermo",
  "whereWeAre.distances.trapani": "Trapani",
  "whereWeAre.distances.catania": "Catania",
  "whereWeAre.distances.messina": "Messina",
  "whereWeAre.directions.badge": "🛣️ Indicazioni",
  "whereWeAre.directions.title": "Come Raggiungerci",
  "whereWeAre.directions.description":
    "Vi aspettiamo a San Biagio Platani. Ecco le indicazioni stradali dalle principali città siciliane.",
  "whereWeAre.directions.fromPalermo.title": "Da Palermo",
  "whereWeAre.directions.fromPalermo.text":
    "Statale Palermo – Agrigento. Imboccare lo svincolo per Casteltermini, proseguire direzione San Biagio Platani per altri 17 km.",
  "whereWeAre.directions.fromCatania.title": "Da Catania",
  "whereWeAre.directions.fromCatania.text":
    "Caltanissetta – Agrigento. Imboccare l'uscita direzione Raffadali e proseguire per Santa Elisabetta, seguire le indicazioni per San Biagio Platani.",
  "whereWeAre.directions.fromTrapani.title": "Da Trapani",
  "whereWeAre.directions.fromTrapani.text":
    "Lungo la SS115 in direzione Agrigento-Siracusa, uscire a Siculiana e proseguire attraversando Raffadali. Seguire indicazioni per Santa Elisabetta e Sant'Angelo Muxaro, continuare per San Biagio Platani.",
  "whereWeAre.airports.badge": "✈️ In Aereo",
  "whereWeAre.airports.title": "Aeroporti in Sicilia",
  "whereWeAre.airports.description": "Per raggiungerci in aereo, la Sicilia dispone di 4 aeroporti internazionali.",
  "whereWeAre.airports.palermo": "Aeroporto Internazionale Falcone e Borsellino di Palermo-Punta Raisi",
  "whereWeAre.airports.catania": "Aeroporto Internazionale Vincenzo Bellini di Catania-Fontanarossa",
  "whereWeAre.airports.trapani": "Aeroporto Vincenzo Florio di Trapani-Birgi",
  "whereWeAre.airports.comiso": "Aeroporto Pio La Torre di Comiso",
})

// English translations
i18n.registerTranslations("en", {
  // Navigation
  "nav.home": "Home",
  "nav.products": "Products",
  "nav.about": "About Us",
  "nav.location": "Where We Are",
  "nav.contact": "Contact",
  "nav.company": "The Farm",
  "nav.quality": "Quality",
  "nav.shop": "Shop",

  // Common buttons
  "btn.readMore": "Learn more",
  "btn.contact": "Contact us",
  "btn.buyNow": "Buy now",
  "btn.addToCart": "Add to cart",
  "btn.checkout": "Proceed to checkout",
  "btn.send": "Send",

  // Footer
  "footer.copyright": "© 2024 l'Olio di Valeria. All rights reserved.",
  "footer.followUs": "Follow Us",

  // Forms
  "form.name": "Name",
  "form.email": "Email",
  "form.message": "Message",
  "form.phone": "Phone",

  // Messages
  "msg.success": "Operation completed successfully",
  "msg.error": "An error occurred",
  "msg.loading": "Loading...",

  // Product descriptions
  "product.quadra.description":
    "Sicilian organic and vegan extra virgin olive oil in elegant Quadra bottle. Available in 250ml format, perfect for daily use, and 500ml, ideal for families. Its distinctive shape protects the oil from light and maintains intact organoleptic properties.",
  "product.kingQuadra.description":
    "Limited edition of our premium oil in exclusive 500ml King Quadra bottle. Superior quality organic and vegan extra virgin olive oil, perfect for true connoisseurs. The medium format is ideal for enhancing special dishes and gourmet recipes.",
  "product.gradolio.description":
    "Sicilian organic and vegan extra virgin olive oil in classic Gradolio bottle. Available in 250ml for singles and couples, 500ml for daily family use, and 750ml for those who love to always have it on hand. Versatile and refined for every preparation.",
  "product.olea.description":
    "Organic and vegan extra virgin olive oil in Olea bottle with modern design. 250ml format practical for small kitchens and 500ml format perfect for daily use. The container protects the oil and enhances its Sicilian golden color.",
  "product.oliena.description":
    "Organic and vegan extra virgin olive oil in refined Oliena bottle. Available in 250ml, great for travel and second homes, and 500ml, versatile format for every culinary need. Premium quality to enrich every dish.",
  "product.marasca.description":
    "Organic and vegan extra virgin olive oil in traditional 1 liter Marasca bottle. The family format par excellence, ideal for those who use quality oil daily in the kitchen. Convenient and practical, keeps the oil fresh longer.",
  "product.latta.description":
    "Organic and vegan extra virgin olive oil in protective 3 and 5 liter tin. The choice of professionals and large families. Large formats ensure the best quality-price ratio and total protection from light. Perfect for preserving Sicilian excellence.",
  "product.spray.description":
    "Organic and vegan extra virgin olive oil in practical 100ml spray format. Ideal for seasoning with precision and without waste. Perfect for salads, grilling and gourmet finishing touches. The spray dispenser allows for controlled and uniform use.",

  // Product titles
  "product.quadra.title": "QUADRA - L'OLIO DI VALERIA",
  "product.kingQuadra.title": "KING QUADRA - L'OLIO DI VALERIA",
  "product.gradolio.title": "GRADOLIO - L'OLIO DI VALERIA",
  "product.olea.title": "OLEA - L'OLIO DI VALERIA",
  "product.oliena.title": "OLIENA - L'OLIO DI VALERIA",
  "product.marasca.title": "MARASCA - L'OLIO DI VALERIA",
  "product.latta.title": "LATTA 3L/5L - L'OLIO DI VALERIA",
  "product.spray.title": "Spray - L'Olio di Valeria",

  // Hero sections
  "hero.terms.badge": "📋 Legal Information",
  "hero.terms.title": "Terms and Conditions",
  "hero.terms.subtitle": "General terms of sale and website use",
  "hero.faq.badge": "❓ Frequently Asked Questions",
  "hero.faq.title": "FAQ",
  "hero.faq.subtitle": "Find answers to the most frequently asked questions about our products, shipping and services",

  // Breadcrumbs
  "breadcrumb.home": "Home",
  "breadcrumb.faq": "FAQ",

  // Footer
  "footer.companyDescription":
    "Sicilian tradition since 1987. Superior quality extra virgin olive oil from the lands of San Biagio Platani.",
  "footer.products": "Products",
  "footer.company": "Company",
  "footer.contact": "Contact",
  "footer.legalInfo": "Legal Information",
  "footer.operatingOffice": "Operating Office",
  "footer.phone": "Tel",
  "footer.socialDescription": "Stay updated with our latest news",
  "footer.link.ourBottles": "Our Bottles",
  "footer.link.oilInTin": "Oil in Tin",
  "footer.link.giftBox": "Gift Box",
  "footer.link.aboutUs": "About Us",
  "footer.link.farm": "The Farm",
  "footer.link.quality": "Quality",
  "footer.link.certifications": "Certifications",
  "footer.link.faq": "FAQ",
  "footer.link.terms": "Terms and Conditions",
  "footer.link.privacy": "Cookies and Privacy Policy",
  "footer.social.facebook": "Facebook",
  "footer.social.instagram": "Instagram",

  // Quality - Health Benefits
  "quality.health.title": "Health Benefits",
  "quality.health.intro":
    "Our extra virgin olive oil is rich in beneficial components that contribute to your body's well-being.",
  "quality.health.vitaminE.title": "Vitamin E",
  "quality.health.vitaminE.description": "Powerful natural antioxidant that protects cells from free radical damage.",
  "quality.health.monounsaturated.title": "Monounsaturated Fats",
  "quality.health.monounsaturated.description":
    "Promote cardiovascular health and help maintain optimal cholesterol levels.",
  "quality.health.oleicAcid.title": "Oleic Acid",
  "quality.health.oleicAcid.description": "Essential fatty acid that supports the immune system and skin health.",
  "quality.health.palmiticAcid.title": "Palmitic Acid",
  "quality.health.palmiticAcid.description": "Contributes to cell membrane structure and energy metabolism.",
  "quality.health.linoleicAcid.title": "Linoleic Acid",
  "quality.health.linoleicAcid.description": "Essential omega-6 fatty acid for skin and nervous system health.",
  "quality.health.stearicAcid.title": "Stearic Acid",
  "quality.health.stearicAcid.description": "Supports energy production and maintains oil stability over time.",

  // Quality - Control Parameters
  "quality.control.badge": "Quality Control",
  "quality.control.title": "Parameters of Excellence",
  "quality.control.intro": "Every batch of our oil undergoes rigorous testing to ensure maximum quality and purity.",
  "quality.control.acidity.title": "Acidity",
  "quality.control.acidity.value": "< 0.30%",
  "quality.control.acidity.limit": "Legal limit: 0.80%",
  "quality.control.acidity.description":
    "Our oil maintains exceptionally low acidity, well below legal limits, guaranteeing freshness and superior quality.",
  "quality.control.polyphenols.title": "Polyphenols",
  "quality.control.polyphenols.value": "High Levels",
  "quality.control.polyphenols.benefit": "Cardiovascular benefits",
  "quality.control.polyphenols.description":
    "Rich in natural polyphenols that prevent aging and support the immune system.",
  "quality.control.peroxides.title": "Peroxides",
  "quality.control.peroxides.value": "< 10",
  "quality.control.peroxides.limit": "Maximum limit: 20",
  "quality.control.peroxides.description":
    "Low peroxide levels ensure the oil maintains its authentic flavor and nutritional properties over time.",
  "quality.control.guarantee.title": "Quality Guarantee",
  "quality.control.guarantee.description":
    "Every bottle is the result of a carefully controlled production process, from olive harvesting to finished product storage. Our standards exceed European regulations for extra virgin olive oil.",

  // Quality - Certifications
  "quality.certifications.title": "Our Certifications",
  "quality.certifications.intro":
    "The quality of our products is guaranteed by the most prestigious certifications in the food industry.",
  "quality.certifications.organic.title": "Organic",
  "quality.certifications.organic.description": "Organic certification guaranteeing natural and sustainable products",
  "quality.certifications.vegan.title": "Vegan",
  "quality.certifications.vegan.description": "Completely vegan products, without animal-derived ingredients",
  "quality.certifications.slowFood.title": "Slow Food",
  "quality.certifications.slowFood.description": "Recognition for the quality and tradition of our production methods",
  "quality.certifications.sicani.title": "Sicani District",
  "quality.certifications.sicani.description": "We are part of the Sicani Rural Quality District",

  // Where We Are - Our Home
  "whereWeAre.ourHome.badge": "🏠 Our Home",
  "whereWeAre.ourHome.title": "San Biagio Platani",
  "whereWeAre.ourHome.description":
    "Our Farm is located in the small village of San Biagio Platani, in the heart of the wonderful Platani Valley.",

  // Where We Are - Address
  "whereWeAre.address.heading": "Address",
  "whereWeAre.address.country": "Sicily, Italy",
  "whereWeAre.address.gpsLabel": "GPS Coordinates",
  "whereWeAre.address.mapLink": "🗺️ Explore on Maps",

  // Where We Are - Distances
  "whereWeAre.distances.heading": "Distances from Cities",
  "whereWeAre.distances.nearbyTitle": "Nearby Cities",
  "whereWeAre.distances.agrigento": "Agrigento",
  "whereWeAre.distances.palermo": "Palermo",
  "whereWeAre.distances.trapani": "Trapani",
  "whereWeAre.distances.catania": "Catania",
  "whereWeAre.distances.messina": "Messina",

  // Where We Are - Directions
  "whereWeAre.directions.badge": "🛣️ Directions",
  "whereWeAre.directions.title": "How to Reach Us",
  "whereWeAre.directions.description":
    "We look forward to seeing you in San Biagio Platani. Here are the driving directions from major Sicilian cities.",
  "whereWeAre.directions.fromPalermo.title": "From Palermo",
  "whereWeAre.directions.fromPalermo.text":
    "State road Palermo – Agrigento. Take the exit for Casteltermini, continue towards San Biagio Platani for another 17 km.",
  "whereWeAre.directions.fromCatania.title": "From Catania",
  "whereWeAre.directions.fromCatania.text":
    "Caltanissetta – Agrigento. Take the exit towards Raffadali and continue to Santa Elisabetta, follow signs for San Biagio Platani.",
  "whereWeAre.directions.fromTrapani.title": "From Trapani",
  "whereWeAre.directions.fromTrapani.text":
    "Along the SS115 towards Agrigento-Siracusa, exit at Siculiana and continue through Raffadali. Follow signs for Santa Elisabetta and Sant'Angelo Muxaro, continue to San Biagio Platani.",

  // Where We Are - Airports
  "whereWeAre.airports.badge": "✈️ By Plane",
  "whereWeAre.airports.title": "Airports in Sicily",
  "whereWeAre.airports.description": "To reach us by plane, Sicily has 4 international airports.",
  "whereWeAre.airports.palermo": "Falcone e Borsellino International Airport of Palermo-Punta Raisi",
  "whereWeAre.airports.catania": "Vincenzo Bellini International Airport of Catania-Fontanarossa",
  "whereWeAre.airports.trapani": "Vincenzo Florio Airport of Trapani-Birgi",
  "whereWeAre.airports.comiso": "Pio La Torre Airport of Comiso",
})

// Export for use in other modules
if (typeof module !== "undefined" && module.exports) {
  module.exports = i18n
}
