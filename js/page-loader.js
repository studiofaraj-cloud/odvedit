;(() => {
  const loaderStyles = `
        .page-loader-overlay {
            position: fixed;
            left: 0;
            width: 100%;
            background-color: rgba(0, 0, 0, 0.95);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 999;
            opacity: 1;
            transition: opacity 0.5s ease-out;
        }
        
        .page-loader-overlay.fade-out {
            opacity: 0;
            pointer-events: none;
        }
        
        .page-loader-spinner {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: conic-gradient(
                from 0deg,
                transparent 0deg,
                transparent 30deg,
                #eab308 30deg,
                #eab308 330deg,
                transparent 330deg,
                transparent 360deg
            );
            animation: page-loader-spin 1.2s linear infinite;
            position: relative;
        }
        
        .page-loader-spinner::before {
            content: '';
            position: absolute;
            top: 3px;
            left: 3px;
            right: 3px;
            bottom: 3px;
            background-color: rgba(0, 0, 0, 0.95);
            border-radius: 50%;
        }
        
        @keyframes page-loader-spin {
            0% {
                transform: rotate(0deg);
            }
            100% {
                transform: rotate(360deg);
            }
        }
        
        body.page-loading section,
        body.page-loading footer,
        body.page-loading main {
            visibility: hidden;
        }
        
        body.page-loading .header,
        body.page-loading header {
            visibility: visible;
            position: relative;
            z-index: 1001;
        }
    `

  const loaderHTML = `
        <div class="page-loader-overlay" id="pageLoader">
            <div class="page-loader-spinner"></div>
        </div>
    `

  function injectStyles() {
    const styleElement = document.createElement("style")
    styleElement.textContent = loaderStyles
    document.head.appendChild(styleElement)
  }

  function calculateHeaderHeight() {
    const header = document.querySelector(".header") || document.querySelector("header")
    if (header) {
      return header.offsetHeight || 80
    }
    return 80
  }

  function injectLoader() {
    const loaderContainer = document.createElement("div")
    loaderContainer.innerHTML = loaderHTML
    const loader = loaderContainer.firstElementChild
    document.body.insertBefore(loader, document.body.firstChild)
    document.body.classList.add("page-loading")

    const headerHeight = calculateHeaderHeight()
    loader.style.top = headerHeight + "px"
    loader.style.height = `calc(100% - ${headerHeight}px)`
  }

  function updateLoaderPosition() {
    const loader = document.getElementById("pageLoader")
    if (loader) {
      const headerHeight = calculateHeaderHeight()
      loader.style.top = headerHeight + "px"
      loader.style.height = `calc(100% - ${headerHeight}px)`
    }
  }

  const maxLoadTimeout = 5000
  let loaderHidden = false

  function hideLoader() {
    if (loaderHidden) return
    loaderHidden = true

    const loader = document.getElementById("pageLoader")
    if (loader) {
      loader.classList.add("fade-out")
      document.body.classList.remove("page-loading")
      setTimeout(() => {
        loader.remove()
      }, 500)
    }
  }

  function createResourcePromise(resource, type, timeout = 3000) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        resolve({ resource, type, status: "timeout" })
      }, timeout)

      const cleanup = (status) => {
        clearTimeout(timeoutId)
        resolve({ resource, type, status })
      }

      try {
        if (type === "image") {
          if (resource.complete) {
            cleanup("complete")
          } else {
            resource.addEventListener("load", () => cleanup("loaded"))
            resource.addEventListener("error", () => cleanup("error"))
          }
        } else if (type === "stylesheet") {
          if (resource.sheet) {
            cleanup("complete")
          } else {
            resource.addEventListener("load", () => cleanup("loaded"))
            resource.addEventListener("error", () => cleanup("error"))
          }
        } else if (type === "script") {
          if (resource.readyState === "complete" || resource.readyState === "loaded") {
            cleanup("complete")
          } else {
            resource.addEventListener("load", () => cleanup("loaded"))
            resource.addEventListener("error", () => cleanup("error"))
          }
        }
      } catch (error) {
        cleanup("error")
      }
    })
  }

  function trackAllResources() {
    const resourcePromises = []

    const images = document.querySelectorAll("img")
    images.forEach((img) => {
      if (img.src) {
        resourcePromises.push(createResourcePromise(img, "image"))
      }
    })

    const stylesheets = document.querySelectorAll('link[rel="stylesheet"]')
    stylesheets.forEach((link) => {
      resourcePromises.push(createResourcePromise(link, "stylesheet"))
    })

    const scripts = document.querySelectorAll("script[src]")
    scripts.forEach((script) => {
      resourcePromises.push(createResourcePromise(script, "script"))
    })

    return Promise.allSettled(resourcePromises)
  }

  function initializeLoader() {
    injectLoader()
    setTimeout(updateLoaderPosition, 100)

    setTimeout(hideLoader, maxLoadTimeout)

    trackAllResources().then(() => {
      hideLoader()
    })

    window.addEventListener("load", () => {
      hideLoader()
    })
  }

  injectStyles()

  if (document.body) {
    initializeLoader()
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      initializeLoader()
    })
  }

  window.addEventListener("resize", updateLoaderPosition)
})()
