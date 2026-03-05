import { useState } from 'react';
import { Link } from 'react-router-dom';
import { hasSecret } from '../lib/secret-storage';

function FAQItem({ question, children }: { question: string; children: React.ReactNode }) {
    const [open, setOpen] = useState(false);
    return (
        <div className={`faq-item ${open ? 'faq-item-open' : ''}`}>
            <button className="faq-question" onClick={() => setOpen(!open)}>
                <span>{question}</span>
                <span className="faq-chevron">{open ? '\u2212' : '+'}</span>
            </button>
            {open && <div className="faq-answer">{children}</div>}
        </div>
    );
}

export default function Home() {
    const registered = hasSecret();

    return (
        <div className="page page-home">
            <div className="hero">
                <h1 className="hero-title">
                    Private Voting for Polkadot OpenGov
                </h1>
                <p className="hero-subtitle">
                    Cast your vote on governance referenda without revealing your identity
                    or preferences. Powered by Groth16 ZK-SNARKs, Poseidon Merkle trees,
                    and pallet-revive on Polkadot.
                </p>
                <div className="hero-features">
                    <div className="hero-feature">
                        <span className="hero-feature-icon">&#128274;</span>
                        <span className="hero-feature-text">
                            <strong>Private</strong> -- Your vote is never linked to your address
                        </span>
                    </div>
                    <div className="hero-feature">
                        <span className="hero-feature-icon">&#9989;</span>
                        <span className="hero-feature-text">
                            <strong>Verifiable</strong> -- ZK proofs guarantee vote validity
                        </span>
                    </div>
                    <div className="hero-feature">
                        <span className="hero-feature-icon">&#9878;</span>
                        <span className="hero-feature-text">
                            <strong>Fair</strong> -- Tier-weighted voting prevents plutocracy
                        </span>
                    </div>
                </div>

                <div className="hero-cta">
                    {registered ? (
                        <Link to="/proposals" className="btn btn-primary btn-lg">
                            View Proposals
                        </Link>
                    ) : (
                        <Link to="/register" className="btn btn-primary btn-lg">
                            Get Started — Register
                        </Link>
                    )}
                </div>
            </div>

            <div className="faq-section">
                <h2 className="faq-title">Frequently Asked Questions</h2>

                <FAQItem question="Is this testnet or mainnet?">
                    <p>
                        The voting contracts are currently deployed on <strong>Polkadot Hub Testnet</strong>.
                        However, your <strong>DOT balance is read from mainnet</strong> (Asset Hub) to determine
                        your voting tier. This means you need real DOT on mainnet, but voting transactions
                        happen on the testnet using the same EVM address.
                    </p>
                    <p>
                        To vote, switch your wallet to the Polkadot Hub Testnet network (chain ID 420420417).
                        You'll need a small amount of testnet PAS tokens for gas. A mainnet deployment is planned soon.
                    </p>
                    <p>
                        <a href="https://faucet.polkadot.io/?parachain=1000" target="_blank" rel="noopener noreferrer">
                            Testnet Faucet (Asset Hub)
                        </a>
                        {' '}&middot;{' '}
                        <a href="https://docs.polkadot.com/polkadot-protocol/basics/accounts/#address-format" target="_blank" rel="noopener noreferrer">
                            Substrate ↔ EVM Account Mapping
                        </a>
                    </p>
                </FAQItem>

                <FAQItem question="How does private voting work?">
                    <p>
                        The system works in three stages:
                    </p>
                    <ol>
                        <li>
                            <strong>Registration:</strong> You generate a random secret voting key in your browser
                            and register its cryptographic commitment (Poseidon hash) on-chain. This links your
                            address to the commitment without revealing the secret.
                        </li>
                        <li>
                            <strong>Proof generation:</strong> When you vote, your browser downloads the full
                            Merkle tree data (same data for everyone — no per-user queries that could leak
                            identity), rebuilds the trees locally, and generates a ZK-SNARK proof. The proof
                            shows you are a registered holder with a certain balance tier, without revealing
                            which address you are.
                        </li>
                        <li>
                            <strong>Submission:</strong> The proof is sent to a relayer, which submits the
                            transaction on-chain on your behalf. Because the relayer submits the tx (not your
                            wallet), your address never appears in the voting transaction. A unique nullifier
                            (derived from your secret + proposal ID) prevents double voting while preserving
                            anonymity.
                        </li>
                    </ol>
                </FAQItem>

                <FAQItem question="Why does privacy-preserving voting matter?">
                    <p>
                        In public on-chain governance, everyone can see who voted and how. This creates
                        real problems:
                    </p>
                    <ul>
                        <li>
                            <strong>Social pressure and coercion:</strong> Large token holders, validators,
                            or community leaders can pressure others to vote a certain way when votes are public.
                        </li>
                        <li>
                            <strong>Vote buying:</strong> When votes are visible, it's trivial to verify that
                            someone voted as paid. Private voting makes vote buying unenforceable.
                        </li>
<li>
                            <strong>Retaliation:</strong> Voters may fear consequences for opposing powerful
                            stakeholders. Anonymity removes this risk.
                        </li>
                    </ul>
                    <p>
                        Secret ballots are a cornerstone of democratic systems for good reason —
                        the same principles apply to on-chain governance.
                    </p>
                </FAQItem>

                <FAQItem question="What are the trust assumptions?">
                    <p>
                        Privacy in this system comes from hiding among other registered users. The ZK proof
                        shows "someone from the registered set voted" — but if there are very few registered
                        users, the anonymity set is small and it may be easy to guess who voted.
                    </p>
                    <p>
                        In the extreme case — one registered user and one vote — the voter's identity is
                        obvious regardless of the ZK proof. The more people register and vote, the stronger
                        the privacy guarantee becomes. This is similar to how Tornado Cash requires a large
                        pool of depositors to provide meaningful anonymity.
                    </p>
                    <p>
                        Additionally, the tree builder (indexer) is currently a trusted role that submits
                        Merkle roots on-chain. It can be verified by anyone since tree data is public,
                        but it cannot be censored without replacing the tree builder key.
                    </p>
                </FAQItem>

                <FAQItem question="When is my balance snapshot taken?">
                    <p>
                        Your DOT balance is captured from a daily snapshot taken at the start of each
                        day (00:00 UTC). When you vote on a proposal, the system uses the most recent
                        snapshot taken <strong>before</strong> the proposal was created on-chain.
                    </p>
                    <p>
                        This means your balance at the start of the day before the proposal appeared
                        determines your voting tier. Transferring DOT after the proposal is created
                        will not change your tier for that proposal. This prevents last-minute balance
                        manipulation to gain higher voting weight.
                    </p>
                </FAQItem>

                <FAQItem question="How are Merkle trees stored and why rebuild them?">
                    <p>
                        The system maintains two Merkle trees: an <strong>Ownership Tree</strong> (registered
                        addresses + commitments) and a <strong>Balances Tree</strong> (addresses + DOT balances
                        from daily chain snapshots). Both are stored as JSON files on S3 and downloaded
                        in full by every voter's browser.
                    </p>
                    <p>
                        <strong>Why rebuild?</strong> Polkadot's native state uses Blake2 hashing, which is
                        extremely expensive to prove inside a ZK circuit (millions of constraints). Instead,
                        the indexer reads the on-chain data and rebuilds the trees using <strong>Poseidon</strong>,
                        a hash function specifically designed for ZK circuits (~250 constraints per hash).
                        This makes proof generation feasible in a browser in seconds rather than hours.
                    </p>
                    <p>
                        <strong>Why is this still secure?</strong> The Merkle tree roots are submitted on-chain
                        by a trusted tree builder and verified by the smart contract. The tree data is public —
                        anyone can download it and verify that the leaves match the on-chain state and that
                        the root is computed correctly. The ZK proof then proves membership against these
                        verified roots.
                    </p>
                </FAQItem>

                <FAQItem question="Why do I need to register on-chain?">
                    <p>
                        The ZK circuit needs to prove that you own a specific Polkadot address. Ideally,
                        we'd verify your sr25519 signature directly inside the circuit. While this is
                        theoretically possible, sr25519 verification in a ZK-SNARK would require millions
                        of constraints — making proof generation take minutes or even hours per vote.
                    </p>
                    <p>
                        Instead, you register once: you generate a secret, compute a Poseidon commitment,
                        and submit it from your address. This creates a binding between your address and
                        your secret in the Ownership Tree. When voting, the circuit only needs to prove
                        you know the secret for a registered commitment — a much cheaper operation
                        (~250 constraints vs millions).
                    </p>
                </FAQItem>

                <FAQItem question="Should I save my voting secret? Can it be recreated?">
                    <p>
                        <strong>Yes, you must save your secret.</strong> It is stored in your browser's
                        localStorage, but if you clear browser data or switch devices, it will be lost.
                    </p>
                    <p>
                        <strong>No, it cannot be recreated.</strong> The secret is generated randomly and
                        is not derived from your wallet keys or any recoverable seed. This is by design:
                        if secrets were derivable from your wallet, anyone with access to your wallet could
                        reconstruct your voting history by recomputing nullifiers and matching them to
                        on-chain records. The random secret ensures that even if your wallet is compromised,
                        your past votes remain private and unlinkable.
                    </p>
                    <p>
                        If you lose your secret, you'll need to register again with a new one. Your previous
                        votes remain valid and anonymous, but you won't be able to vote from the
                        same registration.
                    </p>
                </FAQItem>

                <FAQItem question="How does tier-based voting work?">
                    <p>
                        Instead of "1 DOT = 1 vote" (which gives whales disproportionate power),
                        zkOpenGov groups voters into balance tiers. Each tier has a fixed vote weight,
                        so a large holder gets more influence — but not proportionally more.
                    </p>
                    <table className="faq-tier-table">
                        <thead>
                            <tr>
                                <th>Tier</th>
                                <th>Balance Range</th>
                                <th>Vote Weight</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td>0</td><td>1 – 100 DOT</td><td>1</td></tr>
                            <tr><td>1</td><td>100 – 1,000 DOT</td><td>3</td></tr>
                            <tr><td>2</td><td>1,000 – 10,000 DOT</td><td>6</td></tr>
                            <tr><td>3</td><td>10,000 – 100,000 DOT</td><td>10</td></tr>
                            <tr><td>4</td><td>100,000+ DOT</td><td>15</td></tr>
                        </tbody>
                    </table>
                    <p>
                        A 100,000 DOT holder gets 15x the weight of a 1 DOT holder — not
                        100,000x. Your tier is determined by the ZK circuit from your balance
                        in the snapshot and is never revealed to anyone.
                    </p>
                </FAQItem>

                <FAQItem question="Is zkOpenGov open source?">
                    <p>
                        Yes, the entire project is open source under the MIT license. This includes
                        the ZK circuits, smart contracts, indexer, relayer, client library, and frontend.
                    </p>
                    <p>
                        <a href="https://github.com/shuva10v/zkopengov" target="_blank" rel="noopener noreferrer">
                            github.com/shuva10v/zkopengov
                        </a>
                    </p>
                </FAQItem>
            </div>
        </div>
    );
}
