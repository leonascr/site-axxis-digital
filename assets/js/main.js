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

  if (mobileToggle && mainNav) {
    mobileToggle.addEventListener('click', () => {
      const open = mobileToggle.getAttribute('aria-expanded') === 'true';
      mobileToggle.setAttribute('aria-expanded', String(!open));
      mainNav.classList.toggle('open', !open);
      body.classList.toggle('menu-open', !open);
      if (open) closeDropdowns();
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
    if (!event.target.closest('[data-dropdown]') && !event.target.closest('[data-mobile-toggle]')) {
      closeDropdowns();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeDropdowns();
    if (mobileToggle && mainNav) {
      mobileToggle.setAttribute('aria-expanded', 'false');
      mainNav.classList.remove('open');
      body.classList.remove('menu-open');
    }
  });

  document.querySelectorAll('[data-main-nav] a').forEach((link) => {
    link.addEventListener('click', () => {
      if (window.innerWidth > 980 || !mobileToggle || !mainNav) return;
      mobileToggle.setAttribute('aria-expanded', 'false');
      mainNav.classList.remove('open');
      body.classList.remove('menu-open');
      closeDropdowns();
    });
  });

  const currentPage = body.dataset.page;
  if (currentPage) {
    document.querySelectorAll(`[data-nav="${currentPage}"]`).forEach((link) => {
      link.classList.add('active');
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

  const LEAD_WEBHOOK_URL = 'https://n8n.axxiscontabilidadedigital.com.br/webhook/axxisdigital';

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

      fetch(LEAD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .catch((error) => {
          console.error('Falha ao enviar formulário para o webhook Axxis:', error);
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
