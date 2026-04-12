import Head from 'next/head'
import Footer from '../components/Footer'
import { useEffect, useRef, useState } from 'react'

const RevealSection = ({ children, className, delay = 0 }) => {
    const [visible, setVisible] = useState(false)
    const sectionRef = useRef(null)

    useEffect(() => {
        const currentRef = sectionRef.current
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setVisible(true)
                        observer.unobserve(currentRef)
                    }
                })
            },
            {
                threshold: 0.2,
                rootMargin: '0px 0px -40px 0px',
            }
        )

        if (currentRef) observer.observe(currentRef)
        return () => {
            if (currentRef) observer.unobserve(currentRef)
        }
    }, [])

    return (
        <section
            ref={sectionRef}
            style={{ transitionDelay: `${delay}ms` }}
            className={`${className} transform transition-all duration-700 ease-out ${visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}
        >
            {children}
        </section>
    )
}

function SocialLink({ href, title, children }) {
    if (!href) return null

    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={title}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-600 transition-colors duration-300 hover:border-gray-400 hover:text-black"
        >
            {children}
        </a>
    )
}

export default function Team() {
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    const teamMembers = [
        {
            id: 1,
            role: 'Lead Researcher',
            name: 'Research and Strategy',
            image: '/teampicture/researcher.png',
            description:
                'Dedicated to uncovering the best rental experiences, ensuring the platform truly serves user needs through continuous study and analysis.',
            facebook: 'https://facebook.com/nikolannflores',
            instagram: 'https://www.instagram.com/nikolflrs/',
        },
        {
            id: 2,
            role: 'Lead Designer',
            name: 'UI and UX Design',
            image: '/teampicture/designer.png',
            description:
                'Crafting a beautiful and highly intuitive interface to make the process of renting simple, fast, and accessible for everyone.',
            facebook: 'https://facebook.com/Feighh',
            instagram: 'https://www.instagram.com/aljrcck/',
        },
        {
            id: 3,
            role: 'Programmer',
            name: 'Software Engineer',
            image: '/teampicture/developer.png',
            description:
                "Building and maintaining the platform's core features to keep Abalay reliable, secure, and fast for every user.",
            facebook: 'https://facebook.com/pahingakamunaaaa',
            instagram: 'https://www.instagram.com/alfonzpereezz/',
            portfolio: 'https://alfonz.dev',
            github: 'https://github.com/TacoTues1',
        },
    ]

    return (
        <div className="min-h-screen bg-[#F3F4F5] flex flex-col font-sans selection:bg-black selection:text-white">
            <Head>
                <title>Our Team - Abalay</title>
                <meta name="description" content="Meet the passionate team working behind Abalay to revolutionize the rental experience." />
            </Head>

            <main className="relative flex-1 w-full max-w-[1650px] mx-auto overflow-hidden">
                <div className="pointer-events-none absolute inset-0 -z-10">
                    <div className="absolute top-8 left-[8%] w-40 h-40 rounded-full border border-black/10" />
                    <div className="absolute top-12 left-[10%] w-40 h-40 rounded-full border border-black/5" />
                    <div className="absolute bottom-16 right-[8%] w-64 h-64 rounded-full bg-gray-200/60 blur-3xl" />
                </div>

                <section className="pt-6 sm:pt-8 md:pt-10 pb-10 sm:pb-12 px-4 sm:px-6 lg:px-10">
                    <div className={`max-w-4xl rounded-[30px] bg-white border border-gray-200 p-6 sm:p-8 md:p-10 shadow-[0_18px_40px_rgba(0,0,0,0.06)] transition-all duration-700 ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
                        <p className="text-[11px] font-bold tracking-[0.22em] uppercase text-gray-500 mb-4">Our Team</p>
                        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-[58px] lg:leading-[1.03] font-black text-gray-900 tracking-tight mb-4">
                            The people building <span style={{ fontFamily: '"Pacifico", cursive' }} className="font-normal">Abalay</span>
                        </h1>
                        <p className="text-sm sm:text-base md:text-lg text-gray-600 max-w-2xl font-medium leading-relaxed">
                            We focus on practical product decisions, clean design, and reliable engineering to deliver a better rental platform.
                        </p>
                    </div>
                </section>

                <section className="px-4 sm:px-6 lg:px-10 pb-16 sm:pb-20 md:pb-24">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 sm:gap-6">
                        {teamMembers.map((member, index) => (
                            <RevealSection key={member.id} delay={index * 110} className="h-full">
                                <article className="h-full rounded-[26px] bg-white border border-gray-200 p-5 sm:p-6 shadow-sm transition-shadow hover:shadow-md">
                                    <div className="rounded-2xl border border-gray-200 bg-gray-50 overflow-hidden mb-5 aspect-[4/5]">
                                        <img
                                            src={member.image}
                                            alt={member.role}
                                            loading="lazy"
                                            className="w-full h-full object-cover"
                                        />
                                    </div>

                                    <p className="inline-flex items-center rounded-full bg-gray-100 border border-gray-200 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.15em] text-gray-700">
                                        {member.role}
                                    </p>

                                    <h2 className="text-2xl sm:text-[28px] font-black text-gray-900 leading-tight mt-3">
                                        {member.name}
                                    </h2>

                                    <p className="text-gray-600 text-sm sm:text-base font-medium leading-relaxed mt-3 min-h-[96px]">
                                        {member.description}
                                    </p>

                                    <div className="pt-5 flex flex-wrap gap-2.5">
                                        <SocialLink href={member.facebook} title="Facebook">
                                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                <path fillRule="evenodd" d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" clipRule="evenodd" />
                                            </svg>
                                        </SocialLink>

                                        <SocialLink href={member.instagram} title="Instagram">
                                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                <path fillRule="evenodd" d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" clipRule="evenodd" />
                                            </svg>
                                        </SocialLink>

                                        <SocialLink href={member.portfolio} title="Portfolio">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                <circle cx="12" cy="12" r="9" strokeWidth={1.8} />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12h18" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3c2.5 2.5 4 5.6 4 9s-1.5 6.5-4 9" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3c-2.5 2.5-4 5.6-4 9s1.5 6.5 4 9" />
                                            </svg>
                                        </SocialLink>

                                        <SocialLink href={member.github} title="GitHub">
                                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.486 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.009-.866-.014-1.699-2.782.605-3.369-1.343-3.369-1.343-.455-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.071 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.091-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.389-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.269 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.295 2.748-1.026 2.748-1.026.546 1.378.203 2.397.1 2.65.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.31.678.921.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.481A10.02 10.02 0 0022 12.017C22 6.486 17.523 2 12 2z" clipRule="evenodd" />
                                            </svg>
                                        </SocialLink>
                                    </div>
                                </article>
                            </RevealSection>
                        ))}
                    </div>
                </section>
            </main>

            <Footer />
        </div>
    )
}
