<style>
    header {
        display: flex;
        justify-content: center;
        padding: 20px;
        position: fixed;
        top: 0;
        right: 0;
        width: 100%;
        background-color: #f4c542;
        z-index: 1000;
    }

    .nav-container {
        width: 100%;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .navbar-logo {
        height: 50px;
        margin-left: 20px;
    }

    nav {
        display: flex;
        gap: 25px;
        margin-right: 20px;
    }

    nav a {
        text-decoration: none;
        color: #0b2d56;
        font-weight: bold;
        font-size: 1rem;
        padding: 8px 16px;
        border-radius: 8px;
        transition: all 0.3s ease;
    }

    nav a:hover {
        background-color: #0b2d56; /* gold from logo */
        color: #f4c542; /* dark blue text */
        transform: scale(1.05);
    }

    main {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        height: 100vh;
        box-sizing: border-box;
        overflow: hidden;
        padding: 0;
    }

    .left-section {
        flex: 1;
        max-width: 50%;
        overflow: hidden;
    }

    .left-section h1 {
        margin-top: 16rem;
        margin-left: 2rem;
        font-size: 5rem;
        color: #0b2d56;
        font-weight: 800;
        line-height: 1.1;
        letter-spacing: -1px;
        text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.1);

        opacity: 0;
        transform: translateY(40px);
        animation: fadeUp 1.8s ease-out forwards;
        animation-delay: 0.5s;
    }

    .left-section h2 {
        margin-left: 2rem;
        margin-top: 3rem;
        font-size: 1.5rem;
        color: #0b2d56;
        font-weight: 400;
        line-height: 1.5;
        max-width: 90%;

        opacity: 0;
        transform: translateY(30px);
        animation: fadeUp 1.5s ease-out forwards;
        animation-delay: 1.3s;
    }

    .social-links {
        display: flex;
        gap: 1rem;
        margin-top: 2rem;
        margin-left: 2rem;
        opacity: 0;
        transform: translateY(30px);
        animation: fadeUp 1.5s ease-out forwards;
        animation-delay: 1.7s;
    }

    .social-links a {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 45px;
        height: 45px;
        background-color: #0b2d56;
        color: #f4c542;
        border-radius: 50%;
        text-decoration: none;
        transition: all 0.3s ease;
        box-shadow: 0 4px 12px rgba(11, 45, 86, 0.2);
    }

    .social-links a:hover {
        background-color: #f4c542;
        color: #0b2d56;
        transform: translateY(-3px);
        box-shadow: 0 6px 20px rgba(244, 197, 66, 0.3);
    }

    .social-links svg {
        width: 20px;
        height: 20px;
    }

    .right-section {
        flex: 1;
        display: flex;
        justify-content: flex-start;
        align-items: flex-start;
        overflow: hidden;
        padding: 0;
    }

    .right-section img {
        max-width: 100%;
        max-height: 80%;
        object-fit: contain;
        margin-left: 10rem;
        margin-top: 2rem;
        animation: fadeInBounce 2s ease-out;
    }

    .about-container {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        background: #fff;
        padding-top: 7rem;
        gap: 2rem;
        animation: fadeIn 1.2s ease;
    }

    .about-image {
        width: 750px;         /* Increased from 480px */
        height: 560px;        /* Increased from 480px */
        object-fit: cover;
        border-top-left-radius: 25%;
        border-bottom-left-radius: 25%;
        border-bottom-right-radius: 0;
        border-top-right-radius: 0;
        box-shadow: 0 8px 32px rgba(0,0,0,0.12);
        animation: imageBounceIn 1.5s cubic-bezier(.68,-0.55,.27,1.55);
    }

    .about-content {
        max-width: 600px;
        padding: 2rem 1rem;
        animation: fadeUp 1.2s 0.5s both;
    }

    .about-content h1 {
        font-size: 2.8rem;
        font-weight: 800;
        color: #0b2d56;
        margin-bottom: 1.2rem;
        letter-spacing: -1px;
        text-shadow: 1px 1px 2px rgba(0,0,0,0.08);
        animation: fadeUp 1.2s 0.7s both;
    }

    .about-content p {
        font-size: 1.25rem;
        color: #1e3a66;
        margin-bottom: 1.5rem;
        line-height: 1.6;
        animation: fadeUp 1.2s 0.9s both;
    }

    .about-content a {
        color: #0b2d56;
        font-weight: bold;
        font-size: 1.25rem;
        text-decoration: none;
        transition: color 0.3s;
    }
    .about-content a:hover {
        color: #f4c542;
    }

    .about-contact {
        display: flex;
        flex-direction: column;
        gap: 0.7rem;
        margin-top: 1.2rem;
        font-size: 1.1rem;
        animation: fadeUp 1.2s 1.1s both;
    }

    .about-contact span {
        display: flex;
        align-items: center;
        gap: 0.7rem;
        color: #0b2d56;
        font-weight: 500;
    }

    .about-contact svg {
        width: 1.5em;
        height: 1.5em;
        color: #f4c542;
        flex-shrink: 0;
        animation: iconPop 1.2s 1.2s both;
    }

    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    @keyframes fadeUp {
        from { opacity: 0; transform: translateY(40px);}
        to { opacity: 1; transform: translateY(0);}
    }
    @keyframes fadeInBounce {
        0% {
            opacity: 0;
            transform: scale(0.8) translateY(-50px);
        }
        50% {
            opacity: 1;
            transform: scale(1.05) translateY(10px);
        }
        100% {
            opacity: 1;
            transform: scale(1) translateY(0);
        }
    }
    @keyframes imageBounceIn {
        0% { opacity: 0; transform: scale(0.8) translateY(-60px);}
        60% { opacity: 1; transform: scale(1.05) translateY(10px);}
        100% { opacity: 1; transform: scale(1) translateY(0);}
    }
    @keyframes iconPop {
        0% { opacity: 0; transform: scale(0.5);}
        80% { opacity: 1; transform: scale(1.2);}
        100% { opacity: 1; transform: scale(1);}
    }

    @media (max-width: 900px) {
        .about-container {
            flex-direction: column;
            padding-top: 6rem;
        }
        .about-image {
            width: 98vw;      /* Make it almost full width on small screens */
            height: auto;     /* Maintain aspect ratio */
            border-radius: 40% 40% 0 0;
        }
        .about-content {
            max-width: 95vw;
        }
    }

    /* Mobile Responsive Styles */
    @media (max-width: 768px) {
        header {
            padding: 15px 10px;
        }

        .nav-container {
            flex-direction: column;
            gap: 10px;
        }

        .navbar-logo {
            height: 40px;
            margin-left: 0;
        }

        nav {
            margin-right: 0;
            gap: 15px;
        }

        nav a {
            font-size: 0.9rem;
            padding: 6px 12px;
        }

        main {
            flex-direction: column;
            height: auto;
            min-height: 100vh;
            padding: 120px 20px 40px 20px;
            overflow: visible;
        }

        .left-section {
            max-width: 100%;
            text-align: center;
            margin-bottom: 2rem;
        }

                 .left-section h1 {
             margin-top: 0;
             margin-left: 0;
             font-size: 2.5rem;
             line-height: 1.2;
             margin-bottom: 1rem;
         }

         .left-section h2 {
             margin-left: 0;
             margin-top: 1rem;
             font-size: 1.1rem;
             max-width: 100%;
         }

         .social-links {
             margin-left: 0;
             justify-content: center;
             margin-top: 1.5rem;
         }

         .social-links a {
             width: 40px;
             height: 40px;
         }

         .social-links svg {
             width: 18px;
             height: 18px;
         }

                 .right-section {
             justify-content: center;
             align-items: center;
             margin-top: 2rem;
             width: 100%;
         }

         .right-section img {
             max-width: 80%;
             max-height: 300px;
             margin-left: 0;
             margin-top: 0;
             display: block;
             margin: 0 auto;
         }

        .about-container {
            padding-top: 8rem;
            gap: 1rem;
        }

        .about-image {
            width: 90vw;
            height: auto;
            max-height: 300px;
        }

        .about-content {
            padding: 1rem;
        }

        .about-content h1 {
            font-size: 2rem;
        }

        .about-content p {
            font-size: 1rem;
        }

        .about-contact {
            font-size: 0.9rem;
        }
    }

         @media (max-width: 480px) {
         .left-section h1 {
             font-size: 1.8rem;
             margin-bottom: 0.5rem;
         }

         .left-section h2 {
             font-size: 0.95rem;
             margin-top: 0.5rem;
         }

         .social-links {
             gap: 0.75rem;
             margin-top: 1rem;
         }

         .social-links a {
             width: 35px;
             height: 35px;
         }

         .social-links svg {
             width: 16px;
             height: 16px;
         }

                   .right-section img {
              max-width: 90%;
              max-height: 350px;
              display: block;
              margin: 0 auto;
          }

         .about-content h1 {
             font-size: 1.8rem;
         }

         .about-content p {
             font-size: 0.9rem;
         }
     }
</style>

<script>
    import { onMount } from 'svelte';
    let aboutVisible = false;

    onMount(() => {
        const aboutSection = document.querySelector('.about-container');
        const observer = new window.IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    aboutVisible = true;
                    observer.disconnect();
                }
            },
            { threshold: 0.3 }
        );
        if (aboutSection) observer.observe(aboutSection);
    });
</script>

<header>
    <div class="nav-container">
        <a href="/">
            <img src="/images/digital member portal.png" alt="PHP DGMP" class="navbar-logo" />
        </a>
        <nav>
            <a href="/login">Admin Login</a>
        </nav>
    </div>
</header>

<main>
    <div class="left-section">
        <h1>Welcome to PHP Digital Member Admin</h1>
        <h2>We provide health solutions so we can achieve healthy, happy, and productive lives.</h2>
        <div class="social-links" aria-label="Social media links">
            <a href="https://www.facebook.com/permanentehealthplan" target="_blank" rel="noopener noreferrer" aria-label="Visit our Facebook Page">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M22.675 0h-21.35C.597 0 0 .597 0 1.326v21.348C0 23.403.597 24 1.326 24h11.49v-9.294H9.692V11.08h3.124V8.41c0-3.1 1.893-4.787 4.659-4.787 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.796.715-1.796 1.764v2.312h3.59l-.467 3.626h-3.123V24h6.116C23.403 24 24 23.403 24 22.674V1.326C24 .597 23.403 0 22.675 0z"/>
                </svg>
            </a>
            <a href="https://www.instagram.com/permanentehealthplan" target="_blank" rel="noopener noreferrer" aria-label="Visit our Instagram Profile">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M7 2C4.239 2 2 4.239 2 7v10c0 2.761 2.239 5 5 5h10c2.761 0 5-2.239 5-5V7c0-2.761-2.239-5-5-5H7zm0 2h10c1.654 0 3 1.346 3 3v10c0 1.654-1.346 3-3 3H7c-1.654 0-3-1.346-3-3V7c0-1.654 1.346-3 3-3zm5 3a5 5 0 100 10 5 5 0 000-10zm0 2a3 3 0 110 6 3 3 0 010-6zm6.5-2a1.5 1.5 0 100 3 1.5 1.5 0 000-3z"/>
                </svg>
            </a>
           <a href="https://x.com/permanenteplan" target="_blank" rel="noopener noreferrer" aria-label="Visit our X Profile">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
                    <path d="M18.244 2H21.5L14.026 10.51 22.818 22h-6.89l-5.4-7.514L3.6 22H.338l7.884-8.883L0 2h6.998l5.18 7.078L18.244 2zm-1.21 18.37h1.905L6.04 3.69H3.98z"/>
                </svg>
            </a>
        </div>
    </div>
    <div class="right-section">
        <img src="/images/digital member portal.png" alt="Landing Logo" height="400" />
    </div>
</main>
