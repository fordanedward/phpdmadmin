<style>
    header {
        display: flex;
        justify-content: center;
        padding: 20px;
        position: fixed;
        top: 0;
        right: 0;
        width: 100%;
        background-color: rgba(17, 28, 95, 0);
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
        color: #000;
        font-weight: bold;
        font-size: 1rem;
        padding: 8px 16px;
        border-radius: 8px;
        transition: all 0.3s ease;
    }

    nav a:hover {
        background-color: #334eac;
        color: #fff;
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
        margin-top: 14rem;
        margin-left: 2rem;
        font-size: 5rem;
        color: #334eac;
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
        margin-top: 1rem;
        font-size: 1.5rem;
        color: #333;
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
        margin-top: -1rem;
        animation: fadeInBounce 2s ease-out;
    }

    @keyframes fadeUp {
        to {
            opacity: 1;
            transform: translateY(0);
        }
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
</style>

<header>
    <div class="nav-container">
        <img src="/images/logo(landing) copy.png" alt="ToothTrack Logo" class="navbar-logo" />
        <nav>
            <a href="/login">Login</a>
        </nav>
    </div>
</header>

<main>
    <div class="left-section">
        <h1>Welcome to ToothTrack's Admin Side</h1>
        <h2>Every Tooth In Line, Every Appointment in Time</h2>
    </div>
    <div class="right-section">
        <img src="/images/logo(landing) copy.png" alt="Landing Logo" height="400" />
    </div>
</main>
