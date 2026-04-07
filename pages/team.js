import Head from 'next/head';
import { useRouter } from 'next/router';
import Footer from '../components/Footer';
import { useEffect, useState, useRef } from 'react';

const ScrollSection = ({ children, className }) => {
    const [isVisible, setVisible] = useState(false);
    const domRef = useRef(null);

    useEffect(() => {
        const currentRef = domRef.current;
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    setVisible(true);
                    observer.unobserve(currentRef);
                }
            });
        }, {
            threshold: 0.15,
            rootMargin: '0px 0px -50px 0px'
        });

        if (currentRef) observer.observe(currentRef);
        return () => {
            if (currentRef) observer.unobserve(currentRef);
        };
    }, []);

    return (
        <section
            ref={domRef}
            className={`${className} transition-all duration-[1200ms] ease-[cubic-bezier(0.25,0.4,0,1)] transform ${isVisible ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-20 opacity-0 scale-95'
                }`}
        >
            {children}
        </section>
    );
};

export default function Team() {
    const router = useRouter();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const teamMembers = [
        {
            id: 1,
            role: "Lead Researcher",
            name: "Research & Strategy",
            image: "/teampicture/researcher.png",
            description: "Dedicated to uncovering the best rental experiences, ensuring the platform truly serves user needs through continuous study and analysis.",
            badgeColor: "bg-blue-100 text-blue-700",
            facebook: "https://facebook.com/nikolannflores",
            instagram: "https://www.instagram.com/nikolflrs/"
        },
        {
            id: 2,
            role: "Lead Designer",
            name: "UI/UX Design",
            image: "/teampicture/designer.png",
            description: "Crafting a beautiful and highly intuitive interface to make the process of renting simple, fast, and accessible for everyone.",
            badgeColor: "bg-emerald-100 text-emerald-700",
            facebook: "https://facebook.com/Feighh",
            instagram: "https://www.instagram.com/aljrcck/"
        },
        {
            id: 3,
            role: "Programmer",
            name: "Software Developer",
            image: "/teampicture/developer.png",
            description: "Building and maintaining the platform's core features to keep Abalay reliable, secure, and fast for every user.",
            badgeColor: "bg-amber-100 text-amber-700",
            facebook: "https://facebook.com/pahingakamunaaaa",
            instagram: "https://www.instagram.com/alfonzpereezz/",
            portfolio: "https://portfolioal.vercel.app",
            github: "https://github.com/TacoTues1"
        }
    ];

    return (
        <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans selection:bg-black selection:text-white">
            <Head>
                <title>Our Team - Abalay</title>
                <meta name="description" content="Meet the passionate team working behind Abalay to revolutionize the rental experience." />
            </Head>

            <main className="flex-1 w-full max-w-[1800px] mx-auto overflow-hidden">
                {/* Hero Section */}
                <section className="relative pt-24 sm:pt-28 md:pt-32 pb-10 sm:pb-14 md:pb-16 px-4 sm:px-6 lg:px-8 text-center shrink-0">
                    <div className="absolute inset-0 bg-gradient-to-b from-gray-100/50 to-transparent -z-10 pointer-events-none" />
                    <div className={`transition-all duration-1000 transform ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
                        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-gray-900 tracking-tight mb-3 sm:mb-4">
                            Meet Our <span style={{ fontFamily: '"Pacifico", cursive' }} className="text-black font-normal">Team</span>
                        </h1>
                        <p className="text-sm sm:text-base md:text-lg text-gray-500 max-w-lg sm:max-w-xl md:max-w-2xl mx-auto font-medium leading-relaxed">
                            The passionate individuals working hard to shape the future of renting and property management.
                        </p>
                    </div>
                </section>

                {/* Team Members */}
                <div className="px-4 sm:px-6 lg:px-8 pb-16 sm:pb-20 md:pb-24 space-y-16 sm:space-y-24 max-w-6xl mx-auto">
                    {teamMembers.map((member, index) => (
                        <ScrollSection key={member.id} className={`flex flex-col ${index % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'} items-center gap-10 sm:gap-16 w-full`}>
                            <div className="w-full md:w-1/2 flex justify-center">
                                <div className="relative w-full max-w-[360px] sm:max-w-[420px] aspect-square rounded-full bg-white shadow-xl shadow-gray-200/60 border border-gray-100 p-3 sm:p-4 group hover:shadow-2xl transition-all duration-500 overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-br from-gray-50 to-gray-100 opacity-60 z-0 rounded-full"></div>
                                    
                                    <div className="relative z-10 w-full h-full rounded-full overflow-hidden bg-gray-50/50 flex items-center justify-center">
                                        <div className="w-full h-full transition-transform duration-700 ease-out group-hover:scale-105 rounded-full overflow-hidden">
                                            <img 
                                                src={member.image} 
                                                alt={member.role} 
                                                className="w-full h-full object-cover rounded-full"
                                                loading="lazy"
                                            />
                                        </div>
                                    </div>
                                    
                                    <div className="absolute -bottom-6 -right-6 w-32 h-32 bg-gray-100 rounded-full blur-2xl opacity-60 pointer-events-none"></div>
                                </div>
                            </div>

                            <div className={`w-full md:w-1/2 space-y-4 px-4 text-center ${index % 2 === 0 ? 'md:text-left' : 'md:text-right'}`}>
                                <div className={`inline-flex items-center px-4 py-1.5 rounded-full text-[10px] sm:text-xs font-bold tracking-wide uppercase ${member.badgeColor} shadow-sm border border-black/5`}>
                                    {member.role}
                                </div>
                                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900 tracking-tight">
                                    {member.name}
                                </h2>
                                <p className={`text-gray-500 text-base sm:text-lg font-medium leading-relaxed max-w-[400px] mx-auto ${index % 2 === 0 ? 'md:mx-0' : 'md:ml-auto md:mr-0'}`}>
                                    {member.description}
                                </p>
                                
                                <div className={`flex items-center gap-4 pt-2 justify-center ${index % 2 === 0 ? 'md:justify-start' : 'md:justify-end'}`}>
                                    {member.facebook && (
                                        <a href={member.facebook} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-600 transition-colors">
                                            <svg className="w-8 h-8 md:w-10 md:h-10" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                <path fillRule="evenodd" d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" clipRule="evenodd" />
                                            </svg>
                                        </a>
                                    )}
                                    {member.instagram && (
                                        <a href={member.instagram} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-pink-600 transition-colors">
                                            <svg className="w-8 h-8 md:w-10 md:h-10" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                <path fillRule="evenodd" d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" clipRule="evenodd" />
                                            </svg>
                                        </a>
                                    )}
                                    {member.portfolio && (
                                        <a href={member.portfolio} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-900 transition-colors" title="Portfolio">
                                            <svg className="w-8 h-8 md:w-10 md:h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                <circle cx="12" cy="12" r="9" strokeWidth={1.8} />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12h18" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3c2.5 2.5 4 5.6 4 9s-1.5 6.5-4 9" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3c-2.5 2.5-4 5.6-4 9s1.5 6.5 4 9" />
                                            </svg>
                                        </a>
                                    )}
                                    {member.github && (
                                        <a href={member.github} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-900 transition-colors" title="GitHub">
                                            <svg className="w-8 h-8 md:w-10 md:h-10" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.486 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.009-.866-.014-1.699-2.782.605-3.369-1.343-3.369-1.343-.455-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.071 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.091-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.389-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.269 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.295 2.748-1.026 2.748-1.026.546 1.378.203 2.397.1 2.65.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.31.678.921.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.481A10.02 10.02 0 0022 12.017C22 6.486 17.523 2 12 2z" clipRule="evenodd" />
                                            </svg>
                                        </a>
                                    )}
                                </div>
                            </div>
                        </ScrollSection>
                    ))}
                </div>

                {/* Call Out Section */}
                {/* <ScrollSection className="px-4 sm:px-6 lg:px-8 pb-16 sm:pb-20 md:pb-24">
                    <div className="max-w-2xl lg:max-w-3xl mx-auto bg-black rounded-2xl sm:rounded-3xl p-8 sm:p-10 md:p-14 text-center shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                        <div className="absolute bottom-0 left-0 w-40 h-40 bg-white/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
                        <div className="relative z-10">
                            <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-white mb-2 sm:mb-3">Ready to join our community?</h2>
                            <p className="text-gray-400 font-medium mb-6 sm:mb-8 max-w-md mx-auto text-xs sm:text-sm md:text-base">
                                Experience a platform crafted carefully by our team for the best rental experience.
                            </p>
                            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                                <button onClick={() => router.push('/register')} className="w-full sm:w-auto px-6 py-2.5 sm:py-3 bg-white text-black text-sm font-bold rounded-full hover:bg-gray-100 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5">
                                    Get Started Today
                                </button>
                            </div>
                        </div>
                    </div>
                </ScrollSection> */}
            </main>
            <Footer />
        </div>
    );
}
