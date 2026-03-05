## Packages
jwt-decode | Safely decoding JWT tokens for user state

## Notes
- Tailwind Config - extend fontFamily:
fontFamily: {
  sans: ["var(--font-sans)"],
  display: ["var(--font-display)"],
}
- Backend uses custom JWT authentication. The token is sent via `Authorization: Bearer ${token}`.
- Using `@shared/routes` and `@shared/schema` for all API typing.
