import { type RouteConfig, index, route } from '@react-router/dev/routes';

export default [
  index('./routes/index.tsx'),
  route('signin', './routes/signin.tsx'),
  route('signup', './routes/signup.tsx'),
  route('home', './routes/home.tsx'),
] satisfies RouteConfig;
