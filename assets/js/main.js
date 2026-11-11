(() => {
  'use strict';

  const body = document.body;
  const mobileToggle = document.querySelector('[data-mobile-toggle]');
  const mainNav = document.querySelector('[data-main-nav]');
  const navItems = [...document.querySelectorAll('[data-dropdown]')];

  const closeDropdowns = (except = null) => {
    navItems.forEach((item) => {
      if (item === except) return;
      item.classList.remove('is-open');
      const trigger = item.querySelector('[data-dropdown-trigger]');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
  };

  let navCloseTimer = null;

  const setMobileNav = (open, restoreFocus = false) => {
    if (!mobileToggle || !mainNav) return;
    window.clearTimeout(navCloseTimer);
    mobileToggle.setAttribute('aria-expanded', String(open));
    mobileToggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');

    if (open) {
      mainNav.classList.remove('is-closing');
      body.classList.remove('menu-closing');
      mainNav.classList.add('open');
      body.classList.add('menu-open');
      return;
    }

    if (!mainNav.classList.contains('open')) return;
    const hadFocusInside = mainNav.contains(document.activeElement);
    mainNav.classList.remove('open');
    mainNav.classList.add('is-closing');
    body.classList.remove('menu-open');
    body.classList.add('menu-closing');
    if (restoreFocus && hadFocusInside) mobileToggle.focus();
    navCloseTimer = window.setTimeout(() => {
      mainNav.classList.remove('is-closing');
      body.classList.remove('menu-closing');
      closeDropdowns();
    }, 200);
  };

  if (mobileToggle && mainNav) {
    mobileToggle.addEventListener('click', () => {
      setMobileNav(mobileToggle.getAttribute('aria-expanded') !== 'true');
    });
  }

  navItems.forEach((item) => {
    const trigger = item.querySelector('[data-dropdown-trigger]');
    if (!trigger) return;

    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      const open = item.classList.contains('is-open');
      closeDropdowns(item);
      item.classList.toggle('is-open', !open);
      trigger.setAttribute('aria-expanded', String(!open));
    });
  });

  document.addEventListener('click', (event) => {
    const insideToggle = event.target.closest('[data-mobile-toggle]');
    if (!event.target.closest('[data-dropdown]') && !insideToggle) {
      closeDropdowns();
    }
    if (!event.target.closest('[data-main-nav]') && !insideToggle && mainNav && mainNav.classList.contains('open')) {
      setMobileNav(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeDropdowns();
    setMobileNav(false, true);
  });

  document.querySelectorAll('[data-main-nav] a').forEach((link) => {
    link.addEventListener('click', () => {
      if (window.innerWidth > 980) return;
      setMobileNav(false);
    });
  });

  // Segment carousel: arrows step by one card, and on touch devices (where :hover never
  // fires reliably) tapping a card expands its topic list instead of following the link.
  const segTrack = document.querySelector('[data-segment-track]');
  if (segTrack) {
    const originals = [...segTrack.querySelectorAll('.segment-person')];

    // Infinite loop: flank the real cards with a clone set on each side, then silently
    // rewind scrollLeft by one set whenever the viewport crosses into a clone block.
    // Clones drop their ids (the mega-menu anchors must stay unique) and are hidden from
    // assistive tech, so the loop is purely visual.
    const cloneSet = () => originals.map((card) => {
      const copy = card.cloneNode(true);
      copy.removeAttribute('id');
      copy.setAttribute('aria-hidden', 'true');
      copy.classList.add('is-clone');
      copy.querySelectorAll('a, button').forEach((el) => el.setAttribute('tabindex', '-1'));
      return copy;
    });

    const head = cloneSet();
    const tail = cloneSet();
    tail.forEach((c) => segTrack.appendChild(c));
    head.reverse().forEach((c) => segTrack.insertBefore(c, segTrack.firstChild));

    const gapOf = () => parseFloat(getComputedStyle(segTrack).columnGap) || 0;
    const step = () => (originals[0]?.getBoundingClientRect().width || segTrack.clientWidth) + gapOf();
    const setWidth = () => originals.length * step();

    const withoutSmooth = (fn) => {
      const prevBehavior = segTrack.style.scrollBehavior;
      segTrack.style.scrollBehavior = 'auto';
      fn();
      // Force a reflow so the instant jump lands before smooth scrolling resumes.
      void segTrack.offsetWidth;
      segTrack.style.scrollBehavior = prevBehavior;
    };

    // Which card of the real set is in view, as an index. Kept so a re-layout can put the
    // visitor back where they were instead of snapping to the start.
    let cardOffset = 0;
    const anchor = () => withoutSmooth(() => { segTrack.scrollLeft = setWidth() + cardOffset * step(); });
    anchor();
    let lastStep = step();

    let wrapping = false;
    segTrack.addEventListener('scroll', () => {
      if (wrapping) return;
      const w = setWidth();
      if (segTrack.scrollLeft < w * 0.5 || segTrack.scrollLeft > w * 2.5) {
        wrapping = true;
        const delta = segTrack.scrollLeft < w * 0.5 ? w : -w;
        withoutSmooth(() => { segTrack.scrollLeft += delta; });
        wrapping = false;
      }
      cardOffset = Math.round((segTrack.scrollLeft - setWidth()) / step());
    }, { passive: true });

    // Card width is what the loop maths depends on, and only a width change can invalidate
    // it. Mobile browsers fire resize just from the address bar collapsing during a scroll —
    // re-anchoring on those was enough to throw the carousel back to the first card while
    // someone was reading.
    window.addEventListener('resize', () => {
      const currentStep = step();
      if (Math.abs(currentStep - lastStep) < 1) return;
      lastStep = currentStep;
      anchor();
    });

    // ---- drag to scroll (pointer devices; touch keeps native momentum scrolling)
    let dragging = false;
    let dragStartX = 0;
    let dragStartScroll = 0;
    let dragDistance = 0;

    segTrack.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'touch' || event.button !== 0) return;
      dragging = true;
      dragDistance = 0;
      dragStartX = event.clientX;
      dragStartScroll = segTrack.scrollLeft;
      segTrack.classList.add('is-dragging');
      segTrack.style.scrollBehavior = 'auto';
    });

    segTrack.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      const dx = event.clientX - dragStartX;
      dragDistance = Math.max(dragDistance, Math.abs(dx));
      segTrack.scrollLeft = dragStartScroll - dx;
    });

    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      segTrack.classList.remove('is-dragging');
      segTrack.style.scrollBehavior = '';
    };
    segTrack.addEventListener('pointerup', endDrag);
    segTrack.addEventListener('pointercancel', endDrag);
    segTrack.addEventListener('pointerleave', endDrag);
    // A drag that ends on a link must not also follow it.
    segTrack.addEventListener('click', (event) => {
      if (dragDistance > 6) {
        event.preventDefault();
        event.stopPropagation();
        dragDistance = 0;
      }
    }, true);

    // ---- autoplay, one card at a time
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const AUTOPLAY_MS = 3600;
    let timer = null;
    let inView = true;

    // Latched by the first touch. On a pointer device "leave" is a real signal that the
    // visitor is done, so autoplay can resume; on a touch screen there is no leave, and the
    // pointerleave that fires when the finger lifts was restarting the rotation a moment
    // after a tap — carrying the just-expanded card off screen, which read as the tap not
    // having worked at all. Once someone has touched the track, they drive it.
    let userEngaged = false;

    const stop = () => { clearInterval(timer); timer = null; };
    const start = () => {
      if (timer || reduceMotion || userEngaged || !inView || document.hidden) return;
      timer = setInterval(() => {
        if (dragging) return;
        segTrack.scrollBy({ left: step(), behavior: 'smooth' });
      }, AUTOPLAY_MS);
    };

    const carousel = segTrack.closest('.segment-carousel') || segTrack;
    // Hovering expands a card's topics, so pause and let the visitor actually read it.
    carousel.addEventListener('pointerenter', stop);
    carousel.addEventListener('pointerleave', start);
    carousel.addEventListener('focusin', stop);
    carousel.addEventListener('focusout', start);
    segTrack.addEventListener('touchstart', () => { userEngaged = true; stop(); }, { passive: true });
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        inView = entries[0].isIntersecting;
        if (inView) start(); else stop();
      }, { threshold: 0.25 }).observe(carousel);
    } else {
      start();
    }

    // Phones open on "Arquitetura e engenharia", already expanded. There is no hover on a
    // touch screen, so nothing otherwise signals that these cards open at all — landing on
    // one that is already open is the hint. The track is a loop, so this is just where the
    // initial scroll lands; the card order is untouched and desktop still starts at the top.
    // Autoplay is held off for the same reason the first touch holds it off: rotating away
    // from the card three seconds in would undo the thing this is here to show.
    const openOnLoad = originals.findIndex((card) => card.id === 'engenharia');
    if (openOnLoad > -1 && window.matchMedia('(max-width: 720px)').matches) {
      cardOffset = openOnLoad;
      anchor();
      originals[openOnLoad].classList.add('is-open');
      userEngaged = true;
      stop();
    }

    // Touch fallback for the hover reveal (clones included, so every visible card responds).
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      segTrack.addEventListener('click', (event) => {
        const card = event.target.closest('.segment-person');
        if (!card || event.target.closest('a')) return;
        card.classList.toggle('is-open');
      });
    }
  }

  const currentPage = body.dataset.page;
  if (currentPage) {
    document.querySelectorAll(`[data-nav="${currentPage}"]`).forEach((link) => {
      link.classList.add('active');
      if (link.tagName === 'A') link.setAttribute('aria-current', 'page');
    });
  }

  const revealElements = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -35px' });
    revealElements.forEach((element) => revealObserver.observe(element));
  } else {
    revealElements.forEach((element) => element.classList.add('visible'));
  }

  document.querySelectorAll('.faq-question').forEach((button) => {
    button.addEventListener('click', () => {
      const item = button.closest('.faq-item');
      const accordion = button.closest('.accordion');
      if (!item) return;
      const isOpen = item.classList.contains('open');

      if (accordion && accordion.dataset.single !== 'false') {
        accordion.querySelectorAll('.faq-item.open').forEach((other) => {
          if (other === item) return;
          other.classList.remove('open');
          const otherButton = other.querySelector('.faq-question');
          if (otherButton) otherButton.setAttribute('aria-expanded', 'false');
        });
      }

      item.classList.toggle('open', !isOpen);
      button.setAttribute('aria-expanded', String(!isOpen));
    });
  });

  const tabButtons = [...document.querySelectorAll('[data-service-tab]')];
  const tabPanels = [...document.querySelectorAll('[data-service-panel]')];

  const activateServiceTab = (tabId, updateHash = false) => {
    if (!tabButtons.length || !tabPanels.length) return;
    const validId = tabPanels.some((panel) => panel.dataset.servicePanel === tabId)
      ? tabId
      : tabPanels[0].dataset.servicePanel;

    tabButtons.forEach((button) => {
      const active = button.dataset.serviceTab === validId;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });

    tabPanels.forEach((panel) => {
      const active = panel.dataset.servicePanel === validId;
      panel.classList.toggle('active', active);
      panel.hidden = !active;
    });

    if (updateHash) {
      history.replaceState(null, '', `#${validId}`);
    }
  };

  if (tabButtons.length && tabPanels.length) {
    const requestedTab = window.location.hash.replace('#', '');
    activateServiceTab(requestedTab || tabButtons[0].dataset.serviceTab, false);

    tabButtons.forEach((button, index) => {
      button.addEventListener('click', () => activateServiceTab(button.dataset.serviceTab, true));
      button.addEventListener('keydown', (event) => {
        if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        let nextIndex = index;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % tabButtons.length;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + tabButtons.length) % tabButtons.length;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = tabButtons.length - 1;
        tabButtons[nextIndex].focus();
        activateServiceTab(tabButtons[nextIndex].dataset.serviceTab, true);
      });
    });

    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.replace('#', '');
      if (hash) activateServiceTab(hash, false);
    });
  }

  const formatPhone = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits ? `(${digits}` : '';
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  document.querySelectorAll('input[type="tel"]').forEach((input) => {
    input.addEventListener('input', () => {
      input.value = formatPhone(input.value);
    });
  });

  // Os formulários enviam para o próprio site (rota /api/lead do server.js), que repassa ao
  // n8n. Assim o endereço do webhook não aparece no código da página.
  const LEAD_ENDPOINT = '/api/lead';

  document.querySelectorAll('[data-lead-form]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      const submitButton = form.querySelector('button[type="submit"]');
      const successMessage = form.querySelector('.form-success');
      const originalText = submitButton ? submitButton.innerHTML : '';

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Enviando...';
      }

      const payload = Object.fromEntries(new FormData(form).entries());
      payload.origem_formulario = form.hasAttribute('data-entry-modal-form') ? 'modal-boas-vindas' : 'formulario-pagina';
      payload.pagina = window.location.pathname;
      payload.enviado_em = new Date().toISOString();

      fetch(LEAD_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .catch((error) => {
          console.error('Falha ao enviar o formulário:', error);
        })
        .finally(() => {
          form.reset();
          if (successMessage) successMessage.classList.add('show');
          if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML = originalText;
          }
        });
    });
  });

  // Busca do blog. Filtra os cartões que já estão na página — sem índice, sem dependência e
  // sem requisição. Funciona porque a lista inteira cabe no HTML; se um dia passar de algumas
  // dezenas de artigos, isto vira um índice JSON gerado na publicação.
  const blogSearch = document.querySelector('[data-blog-search]');
  if (blogSearch) {
    const items = [...document.querySelectorAll('[data-blog-item]')];
    const countEl = document.querySelector('[data-blog-count]');
    const emptyEl = document.querySelector('[data-blog-empty]');
    const clearButtons = [...document.querySelectorAll('[data-blog-search-clear]')];

    // Sem acento e sem caixa: quem procura "servico" tem que achar "serviço".
    const normalize = (value) => value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const haystack = new Map(items.map((item) => [item, normalize(item.textContent)]));

    // Paginação. POR_PAGINA é o único número a mexer quando o acervo crescer: 6 preenche
    // duas linhas cheias na grade de três colunas. Ela pagina o resultado da busca, e não a
    // lista inteira, senão filtrar levaria a páginas vazias.
    const POR_PAGINA = 6;
    const pagesEl = document.querySelector('[data-blog-pages]');
    const gridEl = document.querySelector('.blog-grid');
    let pagina = 1;
    let primeiraPassada = true;

    const paginar = (correspondem) => {
      const paginas = Math.ceil(correspondem.length / POR_PAGINA) || 1;
      if (pagina > paginas) pagina = paginas;
      const inicio = (pagina - 1) * POR_PAGINA;

      correspondem.forEach((item, indice) => {
        const naPagina = indice >= inicio && indice < inicio + POR_PAGINA;
        item.hidden = !naPagina;
        // O observer do reveal só dispara para elemento com caixa. Um cartão que nasceu
        // escondido e apareceu por clique ficaria em opacity 0 até uma rolagem qualquer.
        if (naPagina && !primeiraPassada) item.classList.add('visible');
      });

      if (!pagesEl) return;
      pagesEl.hidden = paginas < 2;
      pagesEl.innerHTML = paginas < 2 ? '' : Array.from({ length: paginas }, (unused, i) => {
        const numero = i + 1;
        const ativa = numero === pagina;
        return `<button class="blog-page${ativa ? ' is-active' : ''}" type="button"`
          + ` data-pagina="${numero}" aria-label="Página ${numero}"`
          + `${ativa ? ' aria-current="page"' : ''}>${numero}</button>`;
      }).join('');
    };

    const apply = () => {
      const query = normalize(blogSearch.value.trim());
      const correspondem = items.filter((item) => !query || haystack.get(item).includes(query));
      const shown = correspondem.length;

      items.forEach((item) => { item.hidden = true; });
      paginar(correspondem);

      clearButtons.forEach((button) => { button.hidden = !blogSearch.value; });
      if (emptyEl) emptyEl.hidden = shown > 0;

      if (countEl) {
        const plural = shown === 1 ? 'artigo' : 'artigos';
        countEl.innerHTML = query
          ? `<b>${shown}</b> ${plural} para “${blogSearch.value.trim()}”`
          : `<b>${shown}</b> ${plural} publicados`;
      }
    };

    // Buscar sempre volta para a primeira página: continuar na página 2 de um filtro novo
    // mostraria uma tela vazia com resultados existindo logo acima.
    const buscar = () => {
      pagina = 1;
      apply();
    };

    blogSearch.addEventListener('input', buscar);
    blogSearch.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && blogSearch.value) {
        blogSearch.value = '';
        buscar();
      }
    });

    clearButtons.forEach((button) => {
      button.addEventListener('click', () => {
        blogSearch.value = '';
        buscar();
        blogSearch.focus();
      });
    });

    if (pagesEl) {
      pagesEl.addEventListener('click', (event) => {
        const botao = event.target.closest('[data-pagina]');
        if (!botao) return;
        pagina = Number(botao.dataset.pagina);
        apply();
        // Sem isto o clique troca cartões fora do campo de visão: os botões ficam no fim da
        // grade, e a página nova começa lá em cima. 120px descontam o cabeçalho fixo.
        window.scrollTo({ top: gridEl.getBoundingClientRect().top + window.scrollY - 120, behavior: 'smooth' });
      });
    }

    // Permite que as páginas de categoria mandem o visitante para a busca já preenchida.
    const fromUrl = new URLSearchParams(window.location.search).get('q');
    if (fromUrl) blogSearch.value = fromUrl;

    apply();
    primeiraPassada = false;
  }

  document.querySelectorAll('[data-year]').forEach((element) => {
    element.textContent = String(new Date().getFullYear());
  });

  document.querySelectorAll('.platform-showcase').forEach((showcase) => {
    const tabs = [...showcase.querySelectorAll('.platform-tab')];
    const slides = [...showcase.querySelectorAll('.platform-device-slide')];
    const indicator = showcase.querySelector('.platform-tabs-indicator');

    const moveIndicator = (tab) => {
      if (!indicator) return;
      indicator.style.width = `${tab.offsetWidth}px`;
      indicator.style.height = `${tab.offsetHeight}px`;
      indicator.style.transform = `translate(${tab.offsetLeft}px, ${tab.offsetTop}px)`;
    };

    const activeTab = tabs.find((tab) => tab.classList.contains('active')) || tabs[0];
    if (activeTab && indicator) {
      indicator.classList.add('no-anim');
      moveIndicator(activeTab);
      requestAnimationFrame(() => requestAnimationFrame(() => indicator.classList.remove('no-anim')));
    }

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((other) => other.classList.remove('active'));
        tab.classList.add('active');
        moveIndicator(tab);

        const targetSlide = tab.dataset.platformTab;
        slides.forEach((slide) => {
          slide.classList.toggle('active', slide.dataset.platformSlide === targetSlide);
        });
      });
    });

    window.addEventListener('resize', () => {
      const current = tabs.find((tab) => tab.classList.contains('active'));
      if (current) moveIndicator(current);
    });
  });
})();

(() => {
  'use strict';

  const modal = document.querySelector('[data-entry-modal]');
  if (!modal) return;

  const dialog = modal.querySelector('.entry-modal-dialog');
  const closeButtons = [...modal.querySelectorAll('[data-entry-modal-close]')];
  const modalForm = modal.querySelector('[data-entry-modal-form]');
  const storageKey = 'axxis-entry-modal-seen-v1';
  const windowNameToken = '__axxisEntryModalSeenV1__';
  let lastFocusedElement = null;
  let closeTimer = null;

  const readSeenState = () => {
    try {
      if (window.sessionStorage.getItem(storageKey) === '1') return true;
    } catch (error) {
      // Continue with the window.name fallback below.
    }
    return window.name.includes(windowNameToken);
  };

  const markAsSeen = () => {
    try {
      window.sessionStorage.setItem(storageKey, '1');
    } catch (error) {
      // Storage can be unavailable when the project is opened directly from disk.
    }
    if (!window.name.includes(windowNameToken)) {
      window.name = `${window.name}${windowNameToken}`;
    }
  };

  const getFocusableElements = () => [...modal.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter((element) => !element.hidden && element.offsetParent !== null);

  const openModal = ({ force = false } = {}) => {
    if (!force && readSeenState()) return;
    if (closeTimer) window.clearTimeout(closeTimer);

    lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    markAsSeen();

    window.requestAnimationFrame(() => {
      modal.classList.add('is-visible');
      window.setTimeout(() => {
        const firstField = modal.querySelector('input:not([type="checkbox"])');
        (firstField || dialog)?.focus({ preventScroll: true });
      }, 180);
    });
  };

  const closeModal = () => {
    if (modal.hidden) return;
    modal.classList.remove('is-visible');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');

    closeTimer = window.setTimeout(() => {
      modal.hidden = true;
      if (lastFocusedElement && document.contains(lastFocusedElement)) {
        lastFocusedElement.focus({ preventScroll: true });
      }
    }, 290);
  };

  closeButtons.forEach((button) => button.addEventListener('click', closeModal));

  document.addEventListener('keydown', (event) => {
    if (modal.hidden) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }

    if (event.key !== 'Tab') return;
    const focusable = getFocusableElements();
    if (!focusable.length) {
      event.preventDefault();
      dialog?.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  document.querySelectorAll('[data-open-entry-modal]').forEach((trigger) => {
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      openModal({ force: true });
    });
  });

  if (modalForm) {
    modalForm.addEventListener('submit', () => {
      if (!modalForm.checkValidity()) return;
      window.setTimeout(closeModal, 2200);
    });
  }

  window.axxisOpenDiagnostic = () => openModal({ force: true });
})();
