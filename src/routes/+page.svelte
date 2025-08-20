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
        <h1>Welcome to PHP Digital Member Portal (Admin)</h1>
        <h2>We provide health solutions so we can achieve healthy, happy, and productive lives.</h2>
    </div>
    <div class="right-section">
        <img src="/images/digital member portal.png" alt="Landing Logo" height="400" />
    </div>
</main>
