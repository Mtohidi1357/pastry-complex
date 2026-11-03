import LoginForm from "../../../features/auth/LoginForm";
import styles from "./LoginTheme.module.css";

export default function LoginPage() {
    return <main className={styles.page}>
        <section className={styles.shell} aria-label="Pastry Complex sign in">
            <div className={styles.story}>
                <div className={styles.brand}><span>PC</span><div><strong>Pastry Complex</strong><small>Fresh ideas. Thoughtful operations.</small></div></div>
                <div className={styles.art} role="img" aria-label="Illustration of golden croissants, pastry, berries and coffee" />
                <div className={styles.caption}><p>Crafted with care.</p><h2>Every good day<br />starts with a little pastry.</h2><span>Your branches, your workshop, one connected team.</span></div>
            </div>
            <div className={styles.form}><p className={styles.eyebrow}>Your daily workspace</p><LoginForm /><p className={styles.footnote}>From the first batch to the final delivery.</p></div>
        </section>
    </main>;
}
