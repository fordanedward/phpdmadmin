##  Deployment Instructions (Netlify)

1. Fork or clone the repository.
2. Run `npm install` to install dependencies.
3. Create `.env` file using `.env.example` as template.
4. Build with: `npm run build`
5. Deploy to Netlify:
   - Connect GitHub Repo
   - Set build command: `npm run build`
   - Set publish directory: `build` (or `dist` for SvelteKit)
   - Add env variables from `.env` in Netlify dashboard
