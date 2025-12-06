<style>
    header {
        display: flex;
        justify-content: center;
        padding: 20px;
        position: fixed;
        top: 0;
        right: 0;
        width: 100%;
        background-color: #ffbc22;
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
        color: #ffbc22; /* dark blue text */
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
        color: #ffbc22;
        border-radius: 50%;
        text-decoration: none;
        transition: all 0.3s ease;
        box-shadow: 0 4px 12px rgba(11, 45, 86, 0.2);
    }

    .social-links a:hover {
        background-color: #ffbc22;
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

    /* Mobile Responsive Styles */
    @media (max-width: 768px) {
        header {
            padding: 12px 16px;
            background-color: #ffbc22;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .nav-container {
            flex-direction: row;
            gap: 0;
            justify-content: space-between;
            align-items: center;
        }

        .navbar-logo {
            height: 50px;
            margin-left: 0;
        }

        nav {
            margin-right: 0;
            gap: 0;
            align-items: center;
        }

        nav a {
            font-size: 0.9rem;
            padding: 8px 14px;
            color: #0b2d56;
            border-radius: 6px;
            font-weight: 600;
            letter-spacing: 0.3px;
        }

        main {
            flex-direction: column;
            height: auto;
            min-height: 100vh;
            padding: 100px 20px 40px 20px;
            overflow: visible;
        }

        .left-section {
            max-width: 100%;
            text-align: center;
            margin-bottom: 2.5rem;
        }

        .left-section h1 {
            margin-top: 0;
            margin-left: 0;
            font-size: 2.2rem;
            line-height: 1.3;
            margin-bottom: 1rem;
            color: #0b2d56;
            font-weight: 700;
        }

        .left-section h2 {
            margin-left: 0;
            margin-top: 1rem;
            font-size: 0.95rem;
            max-width: 100%;
            color: #0b2d56;
            line-height: 1.6;
        }

        .social-links {
            margin-left: 0;
            justify-content: center;
            margin-top: 2rem;
            gap: 1.2rem;
        }

        .social-links a {
            width: 44px;
            height: 44px;
            box-shadow: 0 2px 8px rgba(11, 45, 86, 0.15);
        }

        .social-links svg {
            width: 20px;
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
    }

        @media (max-width: 480px) {
        header {
            padding: 10px 12px;
        }

        .navbar-logo {
            height: 42px;
            margin-left: 8px;
        }

        nav {
            gap: 8px;
            margin-right: 8px;
        }

        nav a {
            font-size: 0.85rem;
            padding: 6px 10px;
        }

        .left-section h1 {
            font-size: 1.75rem;
            margin-bottom: 0.8rem;
        }

        .left-section h2 {
            font-size: 0.95rem;
            margin-top: 0.8rem;
        }

        .social-links {
            gap: 0.8rem;
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

        .right-section img {
            max-width: 90%;
            max-height: 350px;
            display: block;
            margin: 0 auto;
        }
    }
</style>

<script>
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
